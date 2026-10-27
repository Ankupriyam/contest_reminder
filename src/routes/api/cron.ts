import { createFileRoute } from "@tanstack/react-router";
import { syncContestsToDatabase } from "@/lib/server/contest-fetcher";
import { syncAllUsersCalendars } from "@/lib/server/sync-service";
import { connectDb } from "@/lib/server/db";
import { logger } from "@/lib/server/logger";

export const Route = createFileRoute("/api/cron")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await connectDb();
          await syncContestsToDatabase();
          await syncAllUsersCalendars();
          return Response.json({ success: true });
        } catch (error) {
          logger.error({
            event: "vercel_cron_failed",
            error: error instanceof Error ? error.message : "unknown",
          });
          return Response.json(
            { success: false, error: "Calendar sync failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
