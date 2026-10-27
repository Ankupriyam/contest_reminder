import { connectDb } from "./db";
import { logger } from "./logger";
import { checkRateLimit } from "./rate-limit";
import { getSessionFromRequest } from "./session";
import { User, type UserDocument } from "@/models/User";

export async function withApiHandler(
  request: Request,
  handler: (user: UserDocument | null) => Promise<Response>,
  options: { requireAuth?: boolean } = {},
): Promise<Response> {
  const rateLimited = checkRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    await connectDb();
  } catch {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  try {
    const session = await getSessionFromRequest(request);
    const user = session ? await User.findById(session.userId) : null;

    if (options.requireAuth && !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return await handler(user);
  } catch (error) {
    logger.error({
      event: "api_handler_failed",
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export function toUserProfile(user: UserDocument) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    image: user.image,
    reminderMinutes: user.reminderMinutes,
    selectedPlatforms: user.selectedPlatforms,
    calendarConnected: Boolean(user.calendarConnected),
  };
}
