"use server";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { createCallSessionForJobQuote } from "@/lib/domain/calls/sessions";

type CallJobRow = {
  id: string;
  customer_id: string | null;
};
type WorkspacePhoneRow = {
  business_phone: string | null;
};
type CustomerPhoneRow = {
  phone: string | null;
};

const FROM_PLACEHOLDER = "workspace-default";
const TO_PLACEHOLDER = "unknown";

function normalizeCandidate(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export async function createCallWorkspaceAction(formData: FormData) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("[calls/new/action] Missing authenticated user");
    redirect("/login");
  }

  const { workspace } = await getCurrentWorkspace({ supabase });
  if (!workspace) {
    console.error("[calls/new/action] Failed to resolve workspace");
    redirect("/calls/new?error=workspace_required");
  }

  const { data: workspacePhoneRow, error: workspacePhoneError } = await supabase
    .from<WorkspacePhoneRow>("workspaces")
    .select("business_phone")
    .eq("id", workspace.id)
    .maybeSingle();

  if (workspacePhoneError) {
    console.error("[calls/new/action] Failed to load workspace phone", workspacePhoneError);
  }

  const normalizedPhone = normalizeCandidate(workspacePhoneRow?.business_phone);
  const fromNumber = normalizedPhone ?? FROM_PLACEHOLDER;
  if (!normalizedPhone) {
    console.warn("[calls/new/action] from_number fallback used", {
      workspaceId: workspace.id,
    });
  }

  const jobIdRaw = formData.get("jobId");
  const jobId = typeof jobIdRaw === "string" ? jobIdRaw.trim() : "";
  if (!jobId) {
    console.error("[calls/new/action] Missing jobId");
    redirect("/calls/new?error=job_id_required");
  }

  const { data: jobRow, error: jobError } = await supabase
    .from<CallJobRow>("jobs")
    .select("id, customer_id")
    .match({ id: jobId, workspace_id: workspace.id })
    .maybeSingle();

  if (jobError) {
    console.error("[calls/new/action] Job lookup failed", jobError);
  }

  if (!jobRow) {
    console.warn("[calls/new/action] Job not found for workspace", { jobId, workspaceId: workspace.id });
  }

  const toNumberOverrideRaw = formData.get("toNumber");
  const toNumberOverride =
    typeof toNumberOverrideRaw === "string" ? normalizeCandidate(toNumberOverrideRaw) : null;
  let toNumber: string | null = toNumberOverride ?? null;

  if (!toNumber && jobRow?.customer_id) {
    let customerPhone: string | null = null;
    const { data: customerRow, error: customerError } = await supabase
      .from<CustomerPhoneRow>("customers")
      .select("phone")
      .match({ id: jobRow.customer_id, workspace_id: workspace.id })
      .maybeSingle();

    if (customerError) {
      console.error("[calls/new/action] Failed to load customer phone", customerError);
    }

    customerPhone = customerRow?.phone ?? null;
    const normalizedCustomerPhone = normalizeCandidate(customerPhone);
    toNumber = normalizedCustomerPhone ?? null;
  }

  if (!toNumber) {
    toNumber = TO_PLACEHOLDER;
    console.warn("[calls/new/action] to_number fallback used", {
      workspaceId: workspace.id,
      jobId,
    });
  }


  let quoteId: string | null = null;
  const quoteIdRaw = formData.get("quoteId");
  if (typeof quoteIdRaw === "string" && quoteIdRaw.trim()) {
    const normalizedQuoteId = quoteIdRaw.trim();
    quoteId = normalizedQuoteId;
    const { data: quoteRow, error: quoteError } = await supabase
      .from("quotes")
      .select("id")
      .match({ id: normalizedQuoteId, workspace_id: workspace.id })
      .maybeSingle();

    if (quoteError) {
      console.error("[calls/new/action] Quote lookup failed", quoteError);
    }

    if (!quoteRow) {
      console.warn(
        "[calls/new/action] Quote not found for workspace",
        { quoteId: normalizedQuoteId, workspaceId: workspace.id }
      );
    }
  }

  const rawScriptBody = formData.get("scriptBody");
  const scriptBodyCandidate =
    typeof rawScriptBody === "string" && rawScriptBody.trim()
      ? rawScriptBody.trim()
      : null;
  const scriptBody = scriptBodyCandidate
    ? scriptBodyCandidate.slice(0, 4000)
    : null;

  const rawCustomerId = formData.get("customerId");
  const customerIdForCall =
    typeof rawCustomerId === "string" ? normalizeCandidate(rawCustomerId) : null;

  try {
    console.log("[calls/new/action] call endpoints", {
      workspaceId: workspace.id,
      jobId,
      fromNumber,
      toNumber,
    });

    const call = await createCallSessionForJobQuote({
      supabase,
      workspaceId: workspace.id,
      userId: user.id,
      jobId,
      customerId: jobRow?.customer_id ?? customerIdForCall ?? null,
      fromNumber,
      toNumber,
      quoteId,
      scriptBody,
    });

    console.log("[calls/new/action] Created call session", {
      callId: call.id,
      workspaceId: call.workspace_id,
      jobId: call.job_id,
    });

    redirect(`/calls/${call.id}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("[calls/new/action] Failed to create call session", error);
    redirect("/calls/new?error=call_creation_failed");
  }
}
