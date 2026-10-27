import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "./calendar-service";
import { syncContestsForPlatforms, syncContestsToDatabase } from "./contest-fetcher";
import { logger } from "./logger";
import { CalendarEvent } from "@/models/CalendarEvent";
import { Contest } from "@/models/Contest";
import { User, type UserDocument } from "@/models/User";
import { isPendingReservationStale } from "./sync-state";
import type { Platform } from "@/types";

export interface SyncResult {
  synced: number;
  removed: number;
  updated: number;
  failed: number;
}

const PENDING_RESERVATION_TIMEOUT_MS = 30 * 60_000;

async function createCalendarEventsForPlatforms(
  user: UserDocument,
  platforms: Platform[],
): Promise<Pick<SyncResult, "synced" | "removed" | "failed">> {
  const now = new Date();
  const contests = await Contest.find({
    platform: { $in: platforms },
    startTime: { $gt: now },
  });

  const results = await Promise.allSettled(
    contests.map(async (contest) => {
      const reservationTime = new Date();
      const existing = await CalendarEvent.findOne({
        userId: user._id,
        contestId: contest.contestId,
      });
      let reservation: NonNullable<typeof existing> | null = null;
      if (existing) {
        if (existing.status === "pending") {
          if (
            !isPendingReservationStale(
              existing.pendingSince,
              reservationTime,
              PENDING_RESERVATION_TIMEOUT_MS,
            )
          ) {
            return "skipped" as const;
          }
          reservation = await CalendarEvent.findOneAndUpdate(
            {
              _id: existing._id,
              status: "pending",
              pendingSince: existing.pendingSince ?? null,
            },
            { $set: { pendingSince: reservationTime } },
            { returnDocument: "after" },
          );
        } else if (existing.status === "disabled" || existing.status === "failed") {
          reservation = await CalendarEvent.findOneAndUpdate(
            { _id: existing._id, status: existing.status },
            { $set: { status: "pending", pendingSince: reservationTime } },
            { returnDocument: "after" },
          );
        } else {
          return "skipped" as const;
        }
        if (!reservation) return "skipped" as const;
      } else {
        try {
          reservation = await CalendarEvent.create({
            userId: user._id,
            contestId: contest.contestId,
            googleEventId: "pending",
            pendingSince: reservationTime,
            status: "pending",
          });
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === 11000
          ) {
            return "skipped" as const;
          }
          throw error;
        }
      }

      let googleEventId: string | undefined;
      try {
        googleEventId = await createCalendarEvent(user, contest);
        reservation.googleEventId = googleEventId;
        reservation.status = "synced";
        reservation.pendingSince = null;
        await reservation.save();
      } catch (error) {
        if (googleEventId) {
          try {
            await deleteCalendarEvent(user, googleEventId);
          } catch {
            reservation.googleEventId = googleEventId;
            reservation.status = "synced";
            reservation.pendingSince = null;
            await reservation.save();
            throw error;
          }
        }
        reservation.status = "disabled";
        reservation.pendingSince = null;
        await reservation.save();
        throw error;
      }
      return "synced" as const;
    }),
  );

  let synced = results.filter((r) => r.status === "fulfilled" && r.value === "synced").length;
  let failed = results.filter((r) => r.status === "rejected").length;
  let removed = 0;

  const currentUser = await User.findById(user._id).select("selectedPlatforms");
  const disabledPlatforms = platforms.filter(
    (platform) => !currentUser?.selectedPlatforms.includes(platform),
  );
  if (disabledPlatforms.length > 0) {
    const cleanup = await removeCalendarEventsForPlatforms(user, disabledPlatforms);
    removed = cleanup.removed;
    failed += cleanup.failed;
    synced = Math.max(0, synced - removed);
  }

  return { synced, removed, failed };
}

async function removeCalendarEventsForPlatforms(
  user: UserDocument,
  platforms: Platform[],
): Promise<Pick<SyncResult, "removed" | "failed">> {
  const now = new Date();
  const calendarEvents = await CalendarEvent.find({
    userId: user._id,
    status: { $in: ["synced", "updated"] },
  });
  if (calendarEvents.length === 0) {
    return { removed: 0, failed: 0 };
  }

  const contests = await Contest.find({
    contestId: { $in: calendarEvents.map((e) => e.contestId) },
    platform: { $in: platforms },
    startTime: { $gt: now },
  });

  const contestsById = new Map(contests.map((c) => [c.contestId, c]));
  const eventsToRemove = calendarEvents.filter((e) => contestsById.has(e.contestId));

  const results = await Promise.allSettled(
    eventsToRemove.map(async (entry) => {
      await deleteCalendarEvent(user, entry.googleEventId);
      entry.status = "disabled";
      entry.pendingSince = null;
      await entry.save();
      return "removed" as const;
    }),
  );

  const removed = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return { removed, failed };
}

async function cleanupCalendarEvents(
  user: UserDocument,
): Promise<Pick<SyncResult, "removed" | "failed">> {
  const now = new Date();
  const calendarEvents = await CalendarEvent.find({
    userId: user._id,
    status: { $in: ["synced", "updated"] },
  });
  if (calendarEvents.length === 0) {
    return { removed: 0, failed: 0 };
  }

  // Find future contests for the user's enabled platforms
  const futureContests = await Contest.find({
    platform: { $in: user.selectedPlatforms },
    startTime: { $gt: now },
  });
  const futureContestIds = new Set(futureContests.map((c) => c.contestId));

  // Cancel stale calendar events but retain their database records for reuse.
  const eventsToRemove = calendarEvents.filter((e) => !futureContestIds.has(e.contestId));

  const results = await Promise.allSettled(
    eventsToRemove.map(async (entry) => {
      await deleteCalendarEvent(user, entry.googleEventId);
      entry.status = "disabled";
      entry.pendingSince = null;
      await entry.save();
      return "removed" as const;
    }),
  );

  const removed = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return { removed, failed };
}

async function updateCalendarEventsForPlatforms(
  user: UserDocument,
  platforms: Platform[],
): Promise<Pick<SyncResult, "updated" | "failed">> {
  const now = new Date();
  const contests = await Contest.find({
    platform: { $in: platforms },
    startTime: { $gt: now },
  });

  const results = await Promise.allSettled(
    contests.map(async (contest) => {
      const existing = await CalendarEvent.findOne({
        userId: user._id,
        contestId: contest.contestId,
        status: { $in: ["synced", "updated"] },
      });
      if (!existing) return "skipped" as const;

      await updateCalendarEvent(user, contest, existing.googleEventId);
      existing.status = "updated";
      await existing.save();
      return "updated" as const;
    }),
  );

  const updated = results.filter((r) => r.status === "fulfilled" && r.value === "updated").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return { updated, failed };
}

export async function handlePlatformChanges(
  user: UserDocument,
  previousPlatforms: Platform[],
  nextPlatforms: Platform[],
): Promise<SyncResult> {
  const platformsAdded = nextPlatforms.filter((p) => !previousPlatforms.includes(p));
  const platformsRemoved = previousPlatforms.filter((p) => !nextPlatforms.includes(p));

  const result: SyncResult = { synced: 0, removed: 0, updated: 0, failed: 0 };

  if (platformsAdded.length > 0) {
    await syncContestsForPlatforms(platformsAdded);
    const created = await createCalendarEventsForPlatforms(user, platformsAdded);
    result.synced += created.synced;
    result.removed += created.removed;
    result.failed += created.failed;
  }

  if (platformsRemoved.length > 0) {
    const removedEvents = await removeCalendarEventsForPlatforms(user, platformsRemoved);
    result.removed += removedEvents.removed;
    result.failed += removedEvents.failed;
  }

  logger.info({
    event: "platform_change_sync_completed",
    userId: user._id.toString(),
    platformsAdded,
    platformsRemoved,
    ...result,
  });

  return result;
}

export async function handleReminderChange(user: UserDocument): Promise<SyncResult> {
  if (user.selectedPlatforms.length === 0) {
    return { synced: 0, removed: 0, updated: 0, failed: 0 };
  }

  const updated = await updateCalendarEventsForPlatforms(user, user.selectedPlatforms);

  logger.info({
    event: "reminder_change_sync_completed",
    userId: user._id.toString(),
    ...updated,
  });

  return { synced: 0, removed: 0, updated: updated.updated, failed: updated.failed };
}

export async function syncUserCalendar(userId: string, options?: { fetchContests?: boolean }) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (!user.calendarConnected) {
    return { synced: 0, updated: 0, failed: 0, removed: 0 };
  }

  if (options?.fetchContests) {
    await syncContestsToDatabase();
  }

  if (user.selectedPlatforms.length === 0) {
    const cleaned = await cleanupCalendarEvents(user);
    return { synced: 0, updated: 0, failed: cleaned.failed, removed: cleaned.removed };
  }

  await syncContestsForPlatforms(user.selectedPlatforms);
  const created = await createCalendarEventsForPlatforms(user, user.selectedPlatforms);
  const cleaned = await cleanupCalendarEvents(user);

  return {
    synced: created.synced,
    updated: 0,
    failed: created.failed + cleaned.failed,
    removed: created.removed + cleaned.removed,
  };
}

export async function syncAllUsersCalendars() {
  logger.info({ event: "cron_calendar_sync_started" });

  await syncContestsToDatabase();
  const users = await User.find({ calendarConnected: true });
  for (const user of users) {
    try {
      await syncUserCalendar(user._id.toString());
    } catch (error) {
      logger.error({
        event: "user_calendar_sync_failed",
        userId: user._id.toString(),
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  logger.info({ event: "cron_calendar_sync_completed", users: users.length });
}
