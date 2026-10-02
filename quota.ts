export interface QuotaWindow {
  remainingPercent: number;
  resetAt?: number; // Unix time in milliseconds
}

export interface Quota {
  fiveHour?: QuotaWindow;
  weekly?: QuotaWindow;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function window(value: unknown): { quota: QuotaWindow; seconds?: number } | undefined {
  const data = record(value);
  if (!data) return undefined;
  const left = data.percent_left;
  const used = data.used_percent ?? data.usedPercent;
  const remainingPercent = typeof left === "number" ? left : typeof used === "number" ? 100 - used : NaN;
  if (!Number.isFinite(remainingPercent) || remainingPercent < 0 || remainingPercent > 100) return undefined;

  const seconds = typeof data.limit_window_seconds === "number" ? data.limit_window_seconds : undefined;
  let resetAt: number | undefined;
  if (typeof data.reset_time_ms === "number") resetAt = data.reset_time_ms;
  else {
    const reset = data.reset_at ?? data.resetsAt;
    if (typeof reset === "number") resetAt = reset < 1e12 ? reset * 1000 : reset;
    else if (typeof reset === "string") resetAt = Date.parse(reset);
    else if (typeof data.reset_after_seconds === "number") resetAt = Date.now() + data.reset_after_seconds * 1000;
  }
  if (resetAt !== undefined && (!Number.isFinite(resetAt) || resetAt <= 0)) resetAt = undefined;
  return { quota: { remainingPercent, ...(resetAt === undefined ? {} : { resetAt }) }, seconds };
}

/** Classify by duration: some plans put the weekly window in primary_window. */
export function parseQuota(value: unknown): Quota {
  const root = record(value);
  const limits = record(root?.rate_limit ?? root?.rate_limits);
  if (!limits) throw new Error("OpenAI did not return rate-limit windows");
  const quota: Quota = {};
  const candidates: Array<["fiveHour" | "weekly", unknown]> = [
    ["fiveHour", limits.five_hour ?? limits.primary_window ?? limits.primary],
    ["weekly", limits.weekly ?? limits.secondary_window ?? limits.secondary],
  ];
  for (const [position, raw] of candidates) {
    const parsed = window(raw);
    if (!parsed) continue;
    const slot = parsed.seconds === undefined ? position : parsed.seconds >= 172800 ? "weekly" : "fiveHour";
    quota[slot] = parsed.quota;
  }
  if (!quota.fiveHour && !quota.weekly) throw new Error("OpenAI did not return rate-limit windows");
  return quota;
}

/** A bar where the filled portion is the quota still available. */
export function renderBar(remainingPercent: number, width: number): { filled: string; empty: string } {
  const size = Math.max(0, Math.floor(width));
  const filled = remainingPercent > 0
    ? Math.max(1, Math.round(size * remainingPercent / 100))
    : 0;
  const count = Math.min(size, filled);
  return { filled: "█".repeat(count), empty: "░".repeat(size - count) };
}

export function formatQuota(quota: Quota): string {
  const format = (label: string, value?: QuotaWindow): string => {
    if (!value) return `${label}: not reported by OpenAI`;
    const percent = `${Number(value.remainingPercent.toFixed(1))}% left`;
    const reset = value.resetAt ? ` · resets ${new Date(value.resetAt).toLocaleString()}` : "";
    return `${label}: ${percent}${reset}`;
  };
  return `OpenAI Codex quota\n${format("5-hour", quota.fiveHour)}\n${format("Weekly", quota.weekly)}`;
}
