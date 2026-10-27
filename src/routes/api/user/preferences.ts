import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { toUserProfile, withApiHandler } from "@/lib/server/api-handler";
import { logger } from "@/lib/server/logger";
import {
  applyPlatformChange,
  platformChangeUpdate,
  samePlatforms,
} from "@/lib/server/sync-state";
import {
  handlePlatformChanges,
  handleReminderChange,
} from "@/lib/server/sync-service";
import { User } from "@/models/User";
import { PLATFORMS, type Platform } from "@/types";

const preferencesSchema = z
  .object({
    platformChange: z
      .object({ platform: z.enum(PLATFORMS), enabled: z.boolean() })
      .optional(),
    selectedPlatforms: z.array(z.enum(PLATFORMS)).optional(),
    reminderMinutes: z.number().int().min(1).max(1440).optional(),
  })
  .refine(
    (body) =>
      body.platformChange !== undefined ||
      body.selectedPlatforms !== undefined ||
      body.reminderMinutes !== undefined,
  )
  .refine((body) => !(body.platformChange && body.selectedPlatforms !== undefined));

const emptySync = { synced: 0, removed: 0, updated: 0, failed: 0 };

export const Route = createFileRoute("/api/user/preferences")({
  server: {
    handlers: {
      PUT: async ({ request }) =>
        withApiHandler(
          request,
          async (user) => {
            if (!user) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }

            let body;
            try {
              body = preferencesSchema.parse(await request.json());
            } catch {
              return Response.json({ error: "Invalid preferences payload" }, { status: 400 });
            }

            let preferenceUser = user;
            let previousPlatforms = [...user.selectedPlatforms] as Platform[];
            let targetPlatforms = previousPlatforms;
            let syncPlatforms = false;
            let reminderChanged = false;
            let sync = emptySync;

            try {
              if (body.platformChange) {
                const previousUser = await User.findOneAndUpdate(
                  { _id: user._id },
                  platformChangeUpdate(body.platformChange),
                  { returnDocument: "before", runValidators: true },
                );
                if (!previousUser) {
                  return Response.json({ error: "User not found" }, { status: 404 });
                }
                previousPlatforms = [...previousUser.selectedPlatforms] as Platform[];
                targetPlatforms = applyPlatformChange(previousPlatforms, body.platformChange);
                syncPlatforms = true;

                const updatedUser = await User.findById(user._id);
                if (!updatedUser) {
                  return Response.json({ error: "User not found" }, { status: 404 });
                }
                preferenceUser = updatedUser;
              } else if (body.selectedPlatforms !== undefined) {
                previousPlatforms = [...user.selectedPlatforms] as Platform[];
                targetPlatforms = [...body.selectedPlatforms];
                preferenceUser.selectedPlatforms = body.selectedPlatforms;
                syncPlatforms = true;
              }

              const previousReminder = preferenceUser.reminderMinutes;
              if (body.reminderMinutes !== undefined) {
                preferenceUser.reminderMinutes = body.reminderMinutes;
              }
              reminderChanged =
                body.reminderMinutes !== undefined && body.reminderMinutes !== previousReminder;
              await preferenceUser.save();
            } catch (error) {
              logger.error({
                event: "preferences_update_failed",
                userId: user._id.toString(),
                error: error instanceof Error ? error.message : "unknown",
              });
              return Response.json(
                { error: "Unable to save preferences. Try again." },
                { status: 500 },
              );
            }

            try {
              if (syncPlatforms) {
                sync = await handlePlatformChanges(
                  preferenceUser,
                  previousPlatforms,
                  targetPlatforms,
                );
              }
              if (reminderChanged) {
                const reminderSync = await handleReminderChange(preferenceUser);
                sync.updated += reminderSync.updated;
                sync.failed += reminderSync.failed;
              }

              if (syncPlatforms || reminderChanged) {
                const latestUser = await User.findById(user._id);
                if (latestUser) {
                  const latestPlatforms = [...latestUser.selectedPlatforms] as Platform[];
                  if (syncPlatforms && !samePlatforms(targetPlatforms, latestPlatforms)) {
                    const reconciliation = await handlePlatformChanges(
                      latestUser,
                      targetPlatforms,
                      latestPlatforms,
                    );
                    sync.synced += reconciliation.synced;
                    sync.removed += reconciliation.removed;
                    sync.updated += reconciliation.updated;
                    sync.failed += reconciliation.failed;
                  }
                  if (latestUser.reminderMinutes !== preferenceUser.reminderMinutes) {
                    const reminderSync = await handleReminderChange(latestUser);
                    sync.updated += reminderSync.updated;
                    sync.failed += reminderSync.failed;
                  }
                  preferenceUser = latestUser;
                }
              }
            } catch (error) {
              logger.error({
                event: "preferences_sync_failed",
                userId: preferenceUser._id.toString(),
                error: error instanceof Error ? error.message : "unknown",
              });
              return Response.json(
                {
                  user: toUserProfile(preferenceUser),
                  sync,
                  error: "Preferences saved but calendar sync failed. Try again.",
                },
                { status: 207 },
              );
            }

            if (sync.failed > 0) {
              return Response.json(
                {
                  user: toUserProfile(preferenceUser),
                  sync,
                  error: "Preferences saved, but some calendar changes failed. Try again.",
                },
                { status: 207 },
              );
            }

            return Response.json({ user: toUserProfile(preferenceUser), sync });
          },
          { requireAuth: true },
        ),
    },
  },
});
