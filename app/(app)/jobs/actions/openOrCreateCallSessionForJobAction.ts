"use server";

import { createServerClient } from "@/utils/supabase/server";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";
import {
  createCallSessionForJobQuote,
  findPreferredCallSessionForJob,
} from "@/lib/domain/calls/sessions";

type OpenOrCreateCallSessionResult =
  | { ok: true; callId: string }
  | { ok: false; code: string; message: string };

const FROM_PLACEHOLDER = "workspace-default";

function normalizeCandidate(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveCustomerPhone(
  job: { customers?: { phone?: string | null }[] | { phone?: string | null } | null },
): string | null {
  const customers = job.customers;
  if (Array.isArray(customers)) {
    return customers[0]?.phone?.trim() ?? null;
  }
  return customers?.phone?.trim() ?? null;
}

export async function openOrCreateCallSessionForJobAction({
  jobId,
}: {
  jobId: string;
}): Promise<OpenOrCreateCallSessionResult> {
  if (!jobId?.trim()) {
    return { ok: false, code: "missing_job_id", message: "Job is required." };
  }

  const supabase = await createServerClient();
  const workspaceResult = await resolveWorkspaceContext({ supabase });
  if (!workspaceResult.ok) {
    return {
      ok: false,
      code: workspaceResult.code,
      message: "We couldn’t verify your workspace session.",
    };
  }

  const { workspaceId, userId } = workspaceResult;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, customer_id, customers(phone)")
    .eq("workspace_id", workspaceId)
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    return { ok: false, code: "job_lookup_failed", message: "Failed to load job details." };
  }

  if (!job) {
    return { ok: false, code: "job_not_found", message: "We couldn’t find that job." };
  }

  let existingSession: { id: string } | null = null;
  try {
    existingSession = await findPreferredCallSessionForJob({
      supabase,
      workspaceId,
      jobId,
    });
  } catch {
    return {
      ok: false,
      code: "call_session_lookup_failed",
      message: "We couldn’t load call sessions for this job.",
    };
  }

  if (existingSession?.id) {
    return { ok: true, callId: existingSession.id };
  }

  const { data: workspaceRow, error: workspaceError } = await supabase
    .from("workspaces")
    .select("business_phone")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) {
    return {
      ok: false,
      code: "workspace_phone_failed",
      message: "We couldn’t load workspace call settings.",
    };
  }

  const normalizedWorkspacePhone = normalizeCandidate(workspaceRow?.business_phone);
  const normalizedDefaultFrom = normalizeCandidate(process.env.TWILIO_FROM_NUMBER ?? null);
  const fromNumber = normalizedWorkspacePhone ?? normalizedDefaultFrom ?? FROM_PLACEHOLDER;
  const customerPhone = resolveCustomerPhone(job) ?? "unknown";

  const createResult = await createCallSessionForJobQuote({
    supabase,
    workspaceId,
    userId,
    jobId,
    customerId: job.customer_id ?? null,
    fromNumber,
    toNumber: customerPhone,
    quoteId: null,
    scriptBody: null,
    summaryOverride: null,
  });

  if (!createResult.success) {
    return {
      ok: false,
      code: "call_session_create_failed",
      message: "We couldn’t create a call session right now.",
    };
  }

  return { ok: true, callId: createResult.call.id };
}
