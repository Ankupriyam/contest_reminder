import { createHash } from "node:crypto";

export function isMissingCalendarEvent(error: unknown) {
  const failure =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown; response?: { status?: unknown } })
      : undefined;
  const status = Number(failure?.code ?? failure?.response?.status);
  const message = error instanceof Error ? error.message : "";
  return (
    status === 404 ||
    status === 410 ||
    message.includes("404") ||
    message.includes("Not Found")
  );
}

export function calendarEventId(userId: string, contestId: string) {
  return createHash("sha256").update(`${userId}:${contestId}`).digest("hex");
}

export async function insertCalendarEventOnce(
  eventId: string,
  insert: () => Promise<string | undefined>,
  recover: () => Promise<void>,
) {
  try {
    const insertedId = await insert();
    if (!insertedId) throw new Error("Google Calendar did not return an event id");
    return insertedId;
  } catch (error) {
    const failure =
      typeof error === "object" && error !== null
        ? (error as { code?: unknown; response?: { status?: unknown } })
        : undefined;
    const code = Number(failure?.code ?? failure?.response?.status);
    if (code !== 409) throw error;

    await recover();
    return eventId;
  }
}
