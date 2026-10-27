import { createFileRoute } from "@tanstack/react-router";

import { withApiHandler } from "@/lib/server/api-handler";
import { ensureContestsFresh } from "@/lib/server/contest-fetcher";
import { CalendarEvent } from "@/models/CalendarEvent";
import { Contest } from "@/models/Contest";
import type { ContestResponse } from "@/types";

export const Route = createFileRoute("/api/contests")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiHandler(
          request,
          async (user) => {
            if (!user) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }

            await ensureContestsFresh();

            const now = new Date();
            const platforms =
              user.selectedPlatforms.length > 0 ? user.selectedPlatforms : [];

            const contests = await Contest.find({
              platform: { $in: platforms },
              startTime: { $gt: now },
            })
              .sort({ startTime: 1 })
              .limit(50);

            const calendarEvents = await CalendarEvent.find({
              userId: user._id,
              contestId: { $in: contests.map((c) => c.contestId) },
              status: { $in: ["synced", "updated"] },
            });

            const syncedIds = new Set(calendarEvents.map((e) => e.contestId));

            const payload: ContestResponse[] = contests.map((contest) => ({
              contestId: contest.contestId,
              platform: contest.platform,
              title: contest.title,
              startTime: contest.startTime.toISOString(),
              endTime: contest.endTime.toISOString(),
              url: contest.url,
              durationMin: Math.round(
                (contest.endTime.getTime() - contest.startTime.getTime()) / 60_000,
              ),
              status: syncedIds.has(contest.contestId)
                ? "Scheduled"
                : "Will be Added Automatically",
            }));

            return Response.json({ contests: payload });
          },
          { requireAuth: true },
        ),
    },
  },
});
