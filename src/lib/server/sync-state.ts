import type { Platform } from "@/types";

export interface PlatformChange {
  platform: Platform;
  enabled: boolean;
}

export function applyPlatformChange(
  platforms: readonly Platform[],
  change: PlatformChange,
): Platform[] {
  if (change.enabled) {
    return platforms.includes(change.platform) ? [...platforms] : [...platforms, change.platform];
  }

  return platforms.filter((platform) => platform !== change.platform);
}

export function platformChangeUpdate(change: PlatformChange) {
  return change.enabled
    ? { $addToSet: { selectedPlatforms: change.platform } }
    : { $pull: { selectedPlatforms: change.platform } };
}

export function samePlatforms(first: readonly Platform[], second: readonly Platform[]) {
  return first.length === second.length && first.every((platform) => second.includes(platform));
}

export function isPendingReservationStale(
  pendingSince: Date | null | undefined,
  now: Date,
  timeoutMs: number,
) {
  return !pendingSince || pendingSince.getTime() <= now.getTime() - timeoutMs;
}
