import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DbClient = SupabaseClient<Database>;

export type CallHistoryRecord = {
  id: string;
  job_id: string | null;
  workspace_id: string | null;
  outcome: string | null;
  status: string | null;
  started_at: string | null;
  created_at: string | null;
  duration_seconds: number | null;
  direction: string | null;
};

export type CallSummarySignals = {
  totalAttempts: number;
  answeredCount: number;
  voicemailCount: number;
  lastOutcome: string | null;
  lastAttemptAt: string | null;
  bestGuessRetryWindow: string | null;
};

export async function loadCallHistoryForJob(
  supabase: DbClient,
  workspaceId: string,
  jobId: string,
  options?: { limit?: number }
): Promise<CallHistoryRecord[]> {
  const limit = options?.limit ?? 25;
  const { data, error } = await supabase
    .from<CallHistoryRecord>("calls")
    .select(
      "id, job_id, workspace_id, outcome, status, started_at, created_at, duration_seconds, direction"
    )
    .eq("workspace_id", workspaceId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return data ?? [];
}

export function computeCallSummarySignals(calls: CallHistoryRecord[]): CallSummarySignals {
  const totalAttempts = calls.length;
  let answeredCount = 0;
  let voicemailCount = 0;
  const parsed = calls.map((call) => {
    const normalizedOutcome = normalizeCallOutcome(call);
    if (normalizedOutcome === "answered") {
      answeredCount += 1;
    }
    if (normalizedOutcome === "voicemail") {
      voicemailCount += 1;
    }
    return {
      call,
      normalizedOutcome,
      timestamp: parseCallTimestamp(call),
    };
  });

  const lastAttemptEntry = parsed
    .filter((entry) => entry.timestamp)
    .sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0))[0];
  const lastAttemptAt = lastAttemptEntry?.timestamp?.toISOString() ?? null;
  const lastOutcome = lastAttemptEntry?.normalizedOutcome ?? null;

  const bestGuessRetryWindow = pickBestRetryWindow(parsed);

  return {
    totalAttempts,
    answeredCount,
    voicemailCount,
    lastOutcome,
    lastAttemptAt,
    bestGuessRetryWindow,
  };
}

export function buildCallHistoryPromptSections(
  signals: CallSummarySignals | null
): { callHistoryLine: string; bestRetryWindowLine: string } {
  if (!signals) {
    return {
      callHistoryLine: "Call history: no data available.",
      bestRetryWindowLine: "Best retry window: no data available.",
    };
  }
  const parts: string[] = [];
  if (signals.totalAttempts === 0) {
    parts.push("no recorded attempts yet");
  } else {
    parts.push(`${signals.totalAttempts} attempts`);
    parts.push(`${signals.answeredCount} answered`);
    parts.push(`${signals.voicemailCount} voicemail`);
    if (signals.lastOutcome) {
      const outcomeLabel = describeCallOutcome(signals.lastOutcome);
      if (outcomeLabel) {
        parts.push(`last outcome ${outcomeLabel}`);
      }
    }
    if (signals.lastAttemptAt) {
      parts.push(`last attempt at ${signals.lastAttemptAt}`);
    }
  }

  const bestRetryLabel =
    signals.bestGuessRetryWindow ?? "not enough data to determine a retry window";

  return {
    callHistoryLine: `Call history: ${parts.join(", ")}.`,
    bestRetryWindowLine: `Best retry window: ${bestRetryLabel}.`,
  };
}

export function describeCallOutcome(outcome: string | null): string | null {
  if (!outcome) {
    return null;
  }
  const normalized = outcome.trim().toLowerCase();
  const labels: Record<string, string> = {
    answered: "Answered",
    voicemail: "Voicemail",
    "no_answer": "No answer",
    "missing": "No answer",
    busy: "Busy",
    "wrong_number": "Wrong number",
    error: "Error",
  };
  if (labels[normalized]) {
    return labels[normalized];
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeCallOutcome(call: CallHistoryRecord): string | null {
  const raw = (call.outcome ?? call.status ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  const answeredOutcomes = new Set([
    "connected_scheduled",
    "connected_not_ready",
    "completed",
    "answered",
  ]);
  const voicemailOutcomes = new Set(["left_voicemail", "voicemail", "inbound_voicemail"]);
  const noAnswerOutcomes = new Set(["missed", "no_answer"]);

  if (answeredOutcomes.has(raw)) {
    return "answered";
  }
  if (voicemailOutcomes.has(raw)) {
    return "voicemail";
  }
  if (noAnswerOutcomes.has(raw)) {
    return "no_answer";
  }
  if (raw === "wrong_number") {
    return "wrong_number";
  }
  if (raw === "busy") {
    return "busy";
  }
  if (raw === "error" || raw === "other") {
    return "error";
  }
  return raw;
}

function parseCallTimestamp(call: CallHistoryRecord): Date | null {
  const candidate = call.started_at ?? call.created_at;
  if (!candidate) {
    return null;
  }
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickBestRetryWindow(parsed: {
  call: CallHistoryRecord;
  normalizedOutcome: string | null;
  timestamp: Date | null;
 }[]): string | null {
  const considered =
    parsed.filter((entry) => entry.timestamp && entry.normalizedOutcome === "answered");
  const pool = considered.length > 0 ? considered : parsed;
  const buckets = new Map<string, { count: number; lastTimestamp: Date }>();

  for (const entry of pool) {
    if (!entry.timestamp) {
      continue;
    }
    const label = classifyRetryWindow(entry.timestamp);
    const existing = buckets.get(label);
    if (existing) {
      existing.count += 1;
      if (entry.timestamp > existing.lastTimestamp) {
        existing.lastTimestamp = entry.timestamp;
      }
      buckets.set(label, existing);
    } else {
      buckets.set(label, { count: 1, lastTimestamp: entry.timestamp });
    }
  }

  let bestLabel: string | null = null;
  let bestCount = 0;
  let bestTimestamp: Date | null = null;

  for (const [label, stats] of buckets.entries()) {
    if (stats.count > bestCount || (stats.count === bestCount && stats.lastTimestamp > (bestTimestamp ?? new Date(0)))) {
      bestLabel = label;
      bestCount = stats.count;
      bestTimestamp = stats.lastTimestamp;
    }
  }
  return bestLabel;
}

function classifyRetryWindow(date: Date): string {
  const hour = date.getHours();
  const day = date.getDay();
  const dayLabel = day === 0 || day === 6 ? "weekend" : "weekday";
  const rangeLabel =
    hour < 12 ? "mornings" : hour < 17 ? "afternoons" : "evenings";
  return `${dayLabel} ${rangeLabel}`;
}
