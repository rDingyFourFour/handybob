import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import {
  getCallOutcomeCodeMetadata,
  type CallOutcomeCode,
} from "@/lib/domain/communications/callOutcomes";
import { isAskBobScriptSummary } from "@/lib/domain/askbob/constants";

const CALL_OUTCOME_PROMPT_NOTES_LIMIT = 200;
const CALL_OUTCOME_OCCURRENCE_FALLBACK = "time unknown";

type LatestCallOutcomeRow = {
  id: string;
  created_at: string | null;
  started_at: string | null;
  summary?: string | null;
  ai_summary?: string | null;
  reached_customer?: boolean | null;
  outcome_code?: string | null;
  outcome_notes?: string | null;
  outcome_recorded_at?: string | null;
  outcome?: string | null;
  status?: string | null;
};

const NEW_OUTCOME_COLUMNS = [
  "reached_customer",
  "outcome_code",
  "outcome_notes",
  "outcome_recorded_at",
] as const;

let hasLoggedMissingOutcomeColumnsWarning = false;

function hasAnyNewOutcomeColumns(row: LatestCallOutcomeRow) {
  return NEW_OUTCOME_COLUMNS.some((column) =>
    Object.prototype.hasOwnProperty.call(row, column),
  );
}

export type LatestCallOutcomeForJob = {
  callId: string;
  occurredAt: string | null;
  reachedCustomer: boolean | null;
  outcomeCode: CallOutcomeCode | null;
  outcomeNotes: string | null;
  isAskBobAssisted: boolean;
};

export function normalizeCallOutcomeNotes(
  value?: string | null,
  limit = CALL_OUTCOME_PROMPT_NOTES_LIMIT,
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }
  const collapsed = trimmed.replace(/\s+/g, " ");
  if (collapsed.length <= limit) {
    return collapsed;
  }
  const capped = collapsed.slice(0, limit - 1).trimEnd();
  return `${capped}…`;
}

function mapLegacyCallOutcomeToCode(outcome?: string | null): CallOutcomeCode | null {
  if (!outcome) {
    return null;
  }
  const normalized = outcome.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.includes("scheduled")) {
    return "reached_scheduled";
  }
  if (normalized.includes("declined")) {
    return "reached_declined";
  }
  if (
    normalized === "reached" ||
    normalized === "connected" ||
    normalized.includes("connected_not_ready")
  ) {
    return "reached_needs_followup";
  }
  if (normalized.includes("voicemail")) {
    return "no_answer_left_voicemail";
  }
  if (normalized === "no_answer" || normalized === "missed" || normalized.includes("no_answer")) {
    return "no_answer_no_voicemail";
  }
  if (normalized === "wrong_number") {
    return "wrong_number";
  }
  if (normalized === "other") {
    return "other";
  }
  return null;
}

function describeBoolean(value: boolean | null) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function isAppointmentScheduled(code: CallOutcomeCode | null) {
  return code === "reached_scheduled";
}

function isVoicemailLeft(code: CallOutcomeCode | null) {
  return code === "no_answer_left_voicemail";
}

export function formatLatestCallOutcomeHint(outcome: LatestCallOutcomeForJob): string {
  const metadata = getCallOutcomeCodeMetadata(outcome.outcomeCode);
  const whenLabel = formatFriendlyDateTime(outcome.occurredAt, "");
  const baseLabel = metadata.label;
  const parts = [`Latest call outcome: ${baseLabel}`];
  if (whenLabel) {
    parts.push(whenLabel);
  }
  return parts.join(" · ");
}

export function buildCallOutcomePromptContext(
  outcome: LatestCallOutcomeForJob | null,
): string | null {
  if (!outcome) {
    return null;
  }
  const metadata = getCallOutcomeCodeMetadata(outcome.outcomeCode);
  const lines = [
    "Latest call outcome:",
    `- Reached customer: ${describeBoolean(outcome.reachedCustomer)}`,
    `- Outcome: ${metadata.label}`,
    `- Occurred at: ${formatFriendlyDateTime(outcome.occurredAt, CALL_OUTCOME_OCCURRENCE_FALLBACK)}`,
    `- Appointment scheduled: ${isAppointmentScheduled(outcome.outcomeCode) ? "yes" : "no"}`,
    `- Voicemail left: ${isVoicemailLeft(outcome.outcomeCode) ? "yes" : "no"}`,
  ];
  if (outcome.outcomeNotes) {
    lines.push(`- Notes: ${outcome.outcomeNotes}`);
  }
  if (outcome.isAskBobAssisted) {
    lines.push("- AskBob-assisted call");
  }
  return lines.join("\n");
}

export async function getLatestCallOutcomeForJob(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  jobId: string,
): Promise<LatestCallOutcomeForJob | null> {
  try {
    const query = supabase
      .from("calls")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    const limitedQuery = query.limit(1) as {
      maybeSingle?: () => Promise<{ data: LatestCallOutcomeRow | null; error: unknown | null }>;
    } & Promise<{ data: LatestCallOutcomeRow[] | null; error: unknown | null }>;
    let data: LatestCallOutcomeRow | null;
    let error: unknown | null;
    if (typeof limitedQuery?.maybeSingle === "function") {
      ({ data, error } = await limitedQuery.maybeSingle());
    } else {
      const response = await limitedQuery;
      const payload = Array.isArray(response.data) ? response.data[0] ?? null : response.data ?? null;
      data = payload;
      error = response.error ?? null;
    }

    if (error) {
      console.error("[latest-call-outcome] Failed to load outcome row", {
        workspaceId,
        jobId,
        errorMessage:
          error && typeof error === "object" && "message" in error
            ? (error as { message?: string }).message
            : null,
        error,
      });
      return null;
    }

    if (!data) {
      return null;
    }

    const hasNewColumns = hasAnyNewOutcomeColumns(data);
    if (!hasNewColumns && process.env.NODE_ENV !== "production" && !hasLoggedMissingOutcomeColumnsWarning) {
      console.warn("[latest-call-outcome] Outcome columns not found; using legacy fields", {
        workspaceId,
        jobId,
      });
      hasLoggedMissingOutcomeColumnsWarning = true;
    }

    const occurredAt = data.outcome_recorded_at ?? data.created_at ?? data.started_at ?? null;
    const hasReachedCustomerColumn = Object.prototype.hasOwnProperty.call(data, "reached_customer");
    const hasOutcomeCodeColumn = Object.prototype.hasOwnProperty.call(data, "outcome_code");
    const hasOutcomeNotesColumn = Object.prototype.hasOwnProperty.call(data, "outcome_notes");
    const summary = data.ai_summary ?? data.summary ?? null;
    const legacyOutcomeCode = mapLegacyCallOutcomeToCode(data.outcome);
    const rawOutcomeCode =
      hasOutcomeCodeColumn && data.outcome_code
        ? (data.outcome_code as CallOutcomeCode)
        : null;
    const resolvedOutcomeCode = rawOutcomeCode ?? legacyOutcomeCode ?? null;
    return {
      callId: data.id,
      occurredAt,
      reachedCustomer: hasReachedCustomerColumn ? data.reached_customer ?? null : null,
      outcomeCode: resolvedOutcomeCode,
      outcomeNotes: hasOutcomeNotesColumn ? normalizeCallOutcomeNotes(data.outcome_notes) : null,
      isAskBobAssisted: isAskBobScriptSummary(summary),
    };
  } catch (error) {
    console.error("[latest-call-outcome] Unexpected error fetching outcome", {
      workspaceId,
      jobId,
      error,
    });
    return null;
  }
}
