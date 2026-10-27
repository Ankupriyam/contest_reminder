import assert from "node:assert/strict";
import test from "node:test";

import type { Platform } from "../src/types.ts";
import {
  calendarEventId,
  insertCalendarEventOnce,
  isMissingCalendarEvent,
} from "../src/lib/server/calendar-event-id.ts";
import {
  applyPlatformChange,
  isPendingReservationStale,
  platformChangeUpdate,
  samePlatforms,
} from "../src/lib/server/sync-state.ts";

test("platform toggles produce atomic Mongo updates and are idempotent", () => {
  const enable = { platform: "leetcode" as const, enabled: true };
  const disable = { platform: "leetcode" as const, enabled: false };

  assert.deepEqual(platformChangeUpdate(enable), {
    $addToSet: { selectedPlatforms: "leetcode" },
  });
  assert.deepEqual(platformChangeUpdate(disable), {
    $pull: { selectedPlatforms: "leetcode" },
  });
  assert.deepEqual(applyPlatformChange([], enable), ["leetcode"]);
  assert.deepEqual(applyPlatformChange(["leetcode"], enable), ["leetcode"]);
  assert.deepEqual(applyPlatformChange(["leetcode", "atcoder"], disable), ["atcoder"]);
  assert.deepEqual(applyPlatformChange(["atcoder"], disable), ["atcoder"]);
});

test("atomic platform changes preserve independent updates from two tabs", () => {
  const leetcode = { platform: "leetcode" as const, enabled: true };
  const codeforces = { platform: "codeforces" as const, enabled: true };

  const firstTabSnapshot: Platform[] = [];
  const secondTabSnapshot: Platform[] = [];
  let staleReplacement: Platform[] = [];
  staleReplacement = [...firstTabSnapshot, leetcode.platform];
  staleReplacement = [...secondTabSnapshot, codeforces.platform];
  assert.deepEqual(staleReplacement, ["codeforces"]);

  const applyAtomicChange = (
    stored: Platform[],
    change: { platform: Platform; enabled: boolean },
  ) => {
    const update = platformChangeUpdate(change);
    if ("$addToSet" in update) {
      return applyPlatformChange(stored, {
        platform: update.$addToSet.selectedPlatforms,
        enabled: true,
      });
    }
    return applyPlatformChange(stored, {
      platform: update.$pull.selectedPlatforms,
      enabled: false,
    });
  };
  const firstOrder = applyAtomicChange(applyAtomicChange([], leetcode), codeforces);
  const secondOrder = applyAtomicChange(applyAtomicChange([], codeforces), leetcode);

  assert.deepEqual(new Set(firstOrder), new Set(["leetcode", "codeforces"]));
  assert.deepEqual(new Set(secondOrder), new Set(["leetcode", "codeforces"]));
  assert.equal(samePlatforms(firstOrder, secondOrder), true);
  assert.equal(samePlatforms(["leetcode"], ["codeforces"]), false);
});

test("stale pending calendar reservations can be reclaimed after the timeout", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");
  const timeout = 30 * 60_000;

  assert.equal(
    isPendingReservationStale(new Date(now.getTime() - timeout - 1), now, timeout),
    true,
  );
  assert.equal(
    isPendingReservationStale(new Date(now.getTime() - timeout + 1), now, timeout),
    false,
  );
  assert.equal(isPendingReservationStale(null, now, timeout), true);
});

test("calendar event IDs are deterministic and valid for Google Calendar", () => {
  const id = calendarEventId("user-1", "contest-9");

  assert.equal(calendarEventId("user-1", "contest-9"), id);
  assert.notEqual(calendarEventId("user-2", "contest-9"), id);
  assert.notEqual(calendarEventId("user-1", "contest-10"), id);
  assert.match(id, /^[0-9a-f]{64}$/);
});

test("a retry after an accepted insert recovers by updating the reserved event", async () => {
  const calls: string[] = [];
  const id = await insertCalendarEventOnce(
    "reserved-id",
    async () => {
      calls.push("insert");
      throw Object.assign(new Error("already exists"), { code: 409 });
    },
    async () => {
      calls.push("update");
    },
  );

  assert.equal(id, "reserved-id");
  assert.deepEqual(calls, ["insert", "update"]);
});

test("transient insert failures propagate without pretending recovery succeeded", async () => {
  let recovered = false;
  const networkError = new Error("network timeout");

  await assert.rejects(
    insertCalendarEventOnce(
      "reserved-id",
      async () => {
        throw networkError;
      },
      async () => {
        recovered = true;
      },
    ),
    networkError,
  );
  assert.equal(recovered, false);
});

test("an insert response without an event ID is treated as a failure", async () => {
  await assert.rejects(
    insertCalendarEventOnce(
      "reserved-id",
      async () => undefined,
      async () => {},
    ),
    /Google Calendar did not return an event id/,
  );
});

test("repeated calendar deletions treat already-missing events as complete", () => {
  assert.equal(isMissingCalendarEvent({ code: 404 }), true);
  assert.equal(isMissingCalendarEvent({ response: { status: 410 } }), true);
  assert.equal(isMissingCalendarEvent(new Error("Not Found")), true);
  assert.equal(isMissingCalendarEvent({ code: 503 }), false);
});
