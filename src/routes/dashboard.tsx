import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Calendar, LogOut, Clock, Bell, Check, Volume2 } from "lucide-react";
import { format } from "date-fns";
import { VideoBackground } from "@/components/VideoBackground";
import { ShinyText } from "@/components/ShinyText";
import { api } from "@/lib/api/client";
import type { ContestResponse, Platform } from "@/types";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Contest Reminder" },
      { name: "description", content: "Manage platforms and reminders." },
    ],
  }),
  component: Dashboard,
});

const PLATFORMS = [
  {
    id: "leetcode" as Platform,
    name: "LeetCode",
    logo: "https://leetcode.com/static/images/LeetCode_logo_rvs.png",
    color: "#FFA116",
  },
  {
    id: "codeforces" as Platform,
    name: "Codeforces",
    logo: "https://codeforces.org/s/0/apple-icon-180x180.png",
    color: "#1F8ACB",
  },
  {
    id: "codechef" as Platform,
    name: "CodeChef",
    logo: "https://cdn.codechef.com/images/cc-logo.png",
    color: "#5B4638",
  },
  {
    id: "atcoder" as Platform,
    name: "AtCoder",
    logo: "https://img.atcoder.jp/assets/atcoder.png",
    color: "#222222",
  },
];

const REMINDER_OPTIONS = [
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
];

function useCountdown(startTimeIso: string) {
  const target = useMemo(() => new Date(startTimeIso).getTime(), [startTimeIso]);
  const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);

  const d = Math.floor(remaining / 86_400_000);
  const h = Math.floor((remaining % 86_400_000) / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);

  if (d > 0) {
    return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  }
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function ContestCard({ c }: { c: ContestResponse }) {
  const platform = PLATFORMS.find((p) => p.id === c.platform)!;
  const countdown = useCountdown(c.startTime);
  const startDate = new Date(c.startTime);
  const date = format(startDate, "EEE, MMM d, yyyy");
  const time = format(startDate, "HH:mm");

  return (
    <div className="liquid-glass group rounded-2xl p-6 transition-all duration-500 hover:-translate-y-1">
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full opacity-30 blur-3xl transition-opacity duration-500 group-hover:opacity-50"
        style={{ background: platform.color }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/95 p-2 ring-1 ring-white/20"
            style={{ boxShadow: `0 8px 32px ${platform.color}55` }}
          >
            <img src={platform.logo} alt={platform.name} className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{platform.name}</p>
            <h3 className="mt-0.5 text-[15px] font-medium leading-tight text-white">{c.title}</h3>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium backdrop-blur ${
            c.status === "Scheduled"
              ? "bg-white/10 text-white/80 ring-1 ring-white/15"
              : "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/30"
          }`}
        >
          {c.status === "Scheduled" ? "Scheduled" : "Auto-add"}
        </span>
      </div>

      <div className="relative mt-6 grid grid-cols-3 gap-3">
        {[
          { k: "Date", v: date },
          { k: "Start", v: time },
          { k: "Duration", v: `${c.durationMin} min` },
        ].map((cell) => (
          <div
            key={cell.k}
            className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-inset ring-white/5"
          >
            <p className="text-[9px] uppercase tracking-[0.16em] text-white/35">{cell.k}</p>
            <p className="mt-1 text-[13px] text-white/90">{cell.v}</p>
          </div>
        ))}
      </div>

      <div className="relative mt-5 flex items-center justify-between rounded-xl bg-gradient-to-r from-white/[0.06] to-white/[0.02] px-4 py-3 ring-1 ring-inset ring-white/10">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <Clock className="h-3.5 w-3.5" />
          Starts in
        </div>
        <span className="font-mono text-[15px] tabular-nums tracking-tight text-white">
          {countdown}
        </span>
      </div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={`${label} reminders`}
      aria-checked={on}
      aria-busy={disabled}
      onClick={() => onChange(!on)}
      disabled={disabled}
      className={`relative flex h-8 w-[76px] shrink-0 items-center rounded-full transition ${
        disabled ? "cursor-wait opacity-60" : ""
      } ${on ? "bg-white" : "bg-white/15"}`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full transition-all ${
          on ? "left-[48px] bg-black" : "left-1 bg-white"
        }`}
      />
      <span
        className={`w-full text-[10px] font-semibold ${
          on ? "pr-7 text-black" : "pl-7 text-white/70"
        }`}
      >
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: ["user"],
    queryFn: api.getUser,
  });

  const contestsQuery = useQuery({
    queryKey: ["contests"],
    queryFn: api.getContests,
    enabled: Boolean(userQuery.data),
  });

  const preferencesMutation = useMutation({
    mutationFn: api.updatePreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(["user"], data.user);
      queryClient.invalidateQueries({ queryKey: ["contests"] });
    },
  });

  const signOutMutation = useMutation({
    mutationFn: api.signOut,
    onSuccess: () => navigate({ to: "/" }),
  });

  const user = userQuery.data;
  const contests = contestsQuery.data?.contests ?? [];

  const preferenceSaveLock = useRef(false);
  const [savingPreference, setSavingPreference] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [customReminderInput, setCustomReminderInput] = useState<string | null>(null);
  const [testingSound, setTestingSound] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);

  const serverEnabled = useMemo(() => {
    const selected = new Set(user?.selectedPlatforms ?? []);
    return Object.fromEntries(PLATFORMS.map((p) => [p.id, selected.has(p.id)])) as Record<
      string,
      boolean
    >;
  }, [user?.selectedPlatforms]);

  const enabled = serverEnabled;
  const reminder = user?.reminderMinutes ?? 15;
  const customReminderValue =
    customReminderInput ??
    (REMINDER_OPTIONS.some((option) => option.value === reminder) ? "" : String(reminder));
  const anyEnabled = Object.values(enabled).some(Boolean);

  const savePreferences = async (
    payload: Parameters<typeof api.updatePreferences>[0],
    key: string,
  ) => {
    if (preferenceSaveLock.current) return;

    preferenceSaveLock.current = true;
    setSavingPreference(key);
    setPreferenceError(null);
    try {
      const response = await preferencesMutation.mutateAsync(payload);
      setPreferenceError(response.error ?? null);
      if (key === "reminder") setCustomReminderInput(null);
    } catch (error) {
      setPreferenceError(error instanceof Error ? error.message : "Unable to save preferences.");
      void queryClient.invalidateQueries({ queryKey: ["user"] });
    } finally {
      preferenceSaveLock.current = false;
      setSavingPreference(null);
    }
  };

  const togglePlatform = (platformId: Platform, value: boolean) => {
    if (preferenceSaveLock.current || !user) return;
    // If turning ON a platform and calendar is not yet connected, redirect to grant calendar permission
    if (value && !user.calendarConnected) {
      window.location.href = `/api/auth/connect/calendar?platform=${platformId}`;
      return;
    }

    void savePreferences(
      { platformChange: { platform: platformId, enabled: value } },
      `platform:${platformId}:${value ? "on" : "off"}`,
    );
  };

  const saveReminder = (minutes: number) => {
    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 1440 ||
      preferenceSaveLock.current
    ) {
      return;
    }
    void savePreferences({ reminderMinutes: minutes }, "reminder");
  };

  const testSound = async () => {
    if (testingSound) return;

    setTestingSound(true);
    setSoundError(null);
    let context: AudioContext | undefined;
    try {
      if (!window.AudioContext) throw new Error("Audio is not supported by this browser.");
      context = new window.AudioContext();
      await context.resume();
      if (context.state === "suspended") throw new Error("Audio playback is blocked.");

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, start);
      oscillator.frequency.setValueAtTime(660, start + 0.22);
      oscillator.frequency.setValueAtTime(880, start + 0.44);
      for (const pulse of [0, 0.22, 0.44]) {
        gain.gain.setValueAtTime(0.0001, start + pulse);
        gain.gain.linearRampToValueAtTime(0.2, start + pulse + 0.025);
        gain.gain.setValueAtTime(0.2, start + pulse + 0.13);
        gain.gain.linearRampToValueAtTime(0.0001, start + pulse + 0.18);
      }
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        void context?.close().catch(() => {});
        setTestingSound(false);
      };
      oscillator.start(start);
      oscillator.stop(start + 0.68);
    } catch {
      if (context && context.state !== "closed") await context.close().catch(() => {});
      setSoundError("Sound could not be played. Check your browser audio settings and try again.");
      setTestingSound(false);
    }
  };

  if (userQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Loading dashboard...
      </div>
    );
  }

  if (userQuery.isError || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p>Unable to load your dashboard.</p>
        <button
          onClick={() => navigate({ to: "/" })}
          className="rounded-full bg-white px-4 py-2 text-sm text-black"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-black text-white" style={{ fontFamily: "Inter, sans-serif" }}>
      <VideoBackground />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="text-base font-medium tracking-tight">Contest Reminder</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-full border border-gray-700 bg-black/30 px-2 py-1.5 pr-4 backdrop-blur sm:flex">
            <img
              src={user.image ?? "https://i.pravatar.cc/64?img=12"}
              alt="profile"
              className="h-7 w-7 rounded-full"
            />
            <div className="text-xs leading-tight">
              <p className="font-medium text-white">{user.name}</p>
              <p className="text-white/60">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOutMutation.mutate()}
            className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-20">
        <section className="pt-20 pb-20 text-center md:pt-28">
          <p className="text-xs tracking-tight text-white/80 uppercase md:text-sm">
            Your dashboard · synced with Google Calendar
          </p>
          <h1
            className="mt-6 font-medium tracking-tighter text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl"
            style={{ lineHeight: 0.85 }}
          >
            <span className="block text-white">Never miss</span>
            <ShinyText text="a contest." className="block" />
          </h1>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-medium tracking-tight">Choose your platforms</h2>
              <p className="mt-1 text-sm text-white/60">
                Enable a platform and we'll quietly add every future contest to your calendar.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORMS.map((p) => {
              const on = enabled[p.id];
              return (
                <div
                  key={p.id}
                  className="liquid-glass group rounded-2xl p-5 transition-all duration-500 hover:-translate-y-1"
                >
                  <div
                    className="absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-20 blur-3xl transition group-hover:opacity-40"
                    style={{ background: p.color }}
                  />
                  <div className="relative flex items-start justify-between">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-2"
                      style={{ boxShadow: `0 0 30px ${p.color}55` }}
                    >
                      <img src={p.logo} alt={p.name} className="h-full w-full object-contain" />
                    </div>
                    <Toggle
                      on={on}
                      onChange={(v) => togglePlatform(p.id, v)}
                      disabled={savingPreference !== null}
                      label={p.name}
                    />
                  </div>
                  <h3 className="relative mt-4 text-lg font-medium">{p.name}</h3>
                  <p className="relative mt-2 min-h-[48px] text-xs leading-relaxed text-white/60">
                    {savingPreference === `platform:${p.id}:on`
                      ? "Adding future contests to your Google Calendar..."
                      : savingPreference === `platform:${p.id}:off`
                        ? "Removing calendar reminders for this platform..."
                        : on
                          ? "All future contests will be added to your Google Calendar with your reminder time."
                          : "Toggle on to start receiving calendar reminders."}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {preferenceError && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          >
            {preferenceError}
          </p>
        )}

        <section className="liquid-glass mt-12 rounded-3xl p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-md">
              <div className="flex items-center gap-2 text-white/60">
                <Bell className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Global reminder</span>
              </div>
              <h2 className="mt-2 text-xl font-medium tracking-tight">
                Remind me before every contest
              </h2>
              <p className="mt-2 text-sm text-white/60">
                Every future contest from your selected platforms will use this reminder time.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {REMINDER_OPTIONS.map((o) => {
                  const active = reminder === o.value;
                  return (
                    <button
                      type="button"
                      key={o.value}
                      onClick={() => saveReminder(o.value)}
                      disabled={savingPreference !== null}
                      className={`rounded-full border px-4 py-2 text-xs transition ${
                        savingPreference !== null
                          ? "cursor-wait opacity-60"
                          : active
                            ? "border-white bg-white text-black"
                            : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {savingPreference === "reminder" && (
                <p className="text-xs text-white/60" role="status">
                  Saving reminder time...
                </p>
              )}
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const minutes = Number(customReminderValue);
                  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
                    setPreferenceError("Enter a whole number of minutes from 1 to 1440.");
                    return;
                  }
                  saveReminder(minutes);
                }}
              >
                <label className="sr-only" htmlFor="custom-reminder-minutes">
                  Custom reminder time in minutes
                </label>
                <input
                  id="custom-reminder-minutes"
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  required
                  value={customReminderValue}
                  onChange={(event) => setCustomReminderInput(event.target.value)}
                  disabled={savingPreference !== null}
                  placeholder="Custom minutes"
                  className="w-36 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white placeholder:text-white/45 focus:outline-none focus:ring-1 focus:ring-white/40 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={savingPreference !== null}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/80 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
                >
                  Save custom time
                </button>
              </form>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl text-xs leading-relaxed text-white/60">
              Contest alerts come from Google Calendar. Allow its notifications in your browser or
              app and enable sound in your device settings. This test checks audio in this open page
              only.
            </div>
            <button
              type="button"
              onClick={() => void testSound()}
              disabled={testingSound}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
            >
              <Volume2 className="h-3.5 w-3.5" />
              {testingSound ? "Playing..." : "Test sound"}
            </button>
          </div>
          {soundError && (
            <p role="alert" className="mt-3 text-sm text-red-200">
              {soundError}
            </p>
          )}
        </section>

        <section className="mt-12">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-medium tracking-tight">Upcoming contests</h2>
              <p className="mt-1 text-sm text-white/60">
                {anyEnabled
                  ? "Synced from your enabled platforms."
                  : "Enable a platform above to see your contests."}
              </p>
            </div>
            <span className="hidden text-xs text-white/50 sm:block">{contests.length} upcoming</span>
          </div>
          {contestsQuery.isLoading ? (
            <p className="text-sm text-white/60">Loading contests...</p>
          ) : contestsQuery.isError ? (
            <p className="text-sm text-red-300">Failed to load contests. Please try again later.</p>
          ) : contests.length === 0 ? (
            <p className="text-sm text-white/60">No upcoming contests found for your platforms.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {contests.map((c) => (
                <ContestCard key={c.contestId} c={c} />
              ))}
            </div>
          )}
        </section>

        <section className="liquid-glass mt-12 rounded-3xl p-6 md:p-8">
          <h2 className="text-xl font-medium tracking-tight">Settings</h2>
          <div className="mt-5 divide-y divide-white/10">
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Google Calendar</p>
                  <p className="text-xs text-white/60">
                    {user.calendarConnected
                      ? `Connected as ${user.email}`
                      : "Not connected"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !user.calendarConnected && (window.location.href = "/api/auth/connect/calendar")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 ${
                  user.calendarConnected
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                    : "bg-white/5 text-white/60 ring-white/15 hover:bg-white/10 cursor-pointer"
                }`}
              >
                {user.calendarConnected ? <Check className="h-3.5 w-3.5" /> : null}
                {user.calendarConnected ? "Connected" : "Not connected"}
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <LogOut className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Logout</p>
                  <p className="text-xs text-white/60">Sign out of Contest Reminder</p>
                </div>
              </div>
              <button
                onClick={() => signOutMutation.mutate()}
                className="group flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition hover:bg-gray-100"
              >
                Sign out{" "}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
