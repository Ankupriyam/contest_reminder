export const PLATFORMS = ["leetcode", "codeforces", "codechef", "atcoder"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  reminderMinutes: number;
  selectedPlatforms: Platform[];
  calendarConnected: boolean;
}

export interface ContestResponse {
  contestId: string;
  platform: Platform;
  title: string;
  startTime: string;
  endTime: string;
  url: string;
  durationMin: number;
  status: "Scheduled" | "Will be Added Automatically";
}

export interface UserPreferencesPayload {
  platformChange?: { platform: Platform; enabled: boolean };
  selectedPlatforms?: Platform[];
  reminderMinutes?: number;
}

export interface SyncResult {
  synced: number;
  removed: number;
  updated: number;
  failed: number;
}

export interface PreferencesUpdateResponse {
  user: UserProfile;
  sync: SyncResult;
  error?: string;
}
