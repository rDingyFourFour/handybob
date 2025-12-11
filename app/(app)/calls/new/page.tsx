import Link from "next/link";
import { redirect } from "next/navigation";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { createCallWorkspaceAction } from "./actions";

type CallsJobSummary = {
  id: string;
  title: string | null;
  status: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null; phone?: string | null }
    | Array<{ id: string | null; name: string | null; phone?: string | null }>
    | null;
};

type CallsQuoteSummary = {
  id: string;
  status: string | null;
  total: number | null;
};

function normalizeCandidate(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveSingleParam(value?: string | string[] | undefined) {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

export default async function CallsNewPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  const rawJobId = searchParams?.jobId;
  const rawQuoteId = searchParams?.quoteId;
  const rawOrigin = searchParams?.origin;
  const rawScriptBody = searchParams?.scriptBody;
  const rawScriptSummary = searchParams?.scriptSummary;
  const rawCustomerId = searchParams?.customerId;
  const jobIdParam = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId ?? null;
  const quoteIdParam = Array.isArray(rawQuoteId) ? rawQuoteId[0] : rawQuoteId ?? null;
  const jobId = jobIdParam ? jobIdParam.trim() : null;
  const quoteId = quoteIdParam ? quoteIdParam.trim() : null;
  const hasJobId = Boolean(jobId);
  const debugJobId = jobId ?? jobIdParam ?? "none";
  const originParam = resolveSingleParam(rawOrigin);
  const scriptBodyQueryParam = resolveSingleParam(rawScriptBody);
  const scriptSummaryQueryParam = resolveSingleParam(rawScriptSummary);
  const customerIdQueryParam = resolveSingleParam(rawCustomerId);
  const jobIdForForm = jobId;
  let quoteIdForForm = quoteId ?? null;
  const scriptBodyForForm = scriptBodyQueryParam?.trim() ?? null;
  const scriptSummaryForForm = scriptSummaryQueryParam?.trim() ?? null;
  const customerIdForForm = customerIdQueryParam?.trim() ?? null;
  const showAskBobScriptHint =
    originParam === "askbob-call-assist" && Boolean(scriptBodyForForm);

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[calls/new] Failed to resolve workspace:", error);
  }

  let workspaceBusinessPhone: string | null = null;
  if (workspace) {
    try {
      const { data: workspacePhoneRow, error: workspacePhoneError } = await supabase
        .from("workspaces")
        .select("business_phone")
        .eq("id", workspace.id)
        .maybeSingle();

      if (workspacePhoneError) {
        console.error("[calls/new] Failed to load workspace phone:", workspacePhoneError);
      } else {
        workspaceBusinessPhone = workspacePhoneRow?.business_phone ?? null;
      }
    } catch (error) {
      console.error("[calls/new] Workspace phone query failed:", error);
    }
  }

  if (workspace && showAskBobScriptHint) {
    console.log("[calls-compose-from-askbob-call-assist]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId,
      customerId: customerIdForForm,
      scriptLength: scriptBodyForForm?.length ?? 0,
      origin: originParam,
      hasQuoteContext: Boolean(quoteIdForForm),
      hasFollowupContext: false,
    });
  }

  let newCallJob: CallsJobSummary | null = null;
  let newCallJobWarning: string | null = null;
  if (workspace && jobId) {
    try {
      const { data: jobRow, error: jobError } = await supabase
        .from<CallsJobSummary>("jobs")
        .select("id, title, status, customer_id, customers(id, name, phone)")
        .eq("workspace_id", workspace.id)
        .eq("id", jobId)
        .maybeSingle();
      if (jobError) {
        console.error("[calls/new] Job lookup failed:", jobError);
        newCallJobWarning =
          "We couldn’t load this job right now, but you can still create the call workspace.";
      }
      newCallJob = jobRow ?? null;
      if (!jobRow) {
        newCallJobWarning =
          "We couldn’t find this job in your workspace, but you can still try creating the call workspace.";
      }
    } catch (error) {
      console.error("[calls/new] Job query error:", error);
      newCallJobWarning = "We couldn’t find this job in your workspace.";
    }
  } else if (jobId && !workspace) {
    newCallJobWarning = "Unable to resolve workspace for this job.";
  }

  let newCallQuote: CallsQuoteSummary | null = null;
  let newCallQuoteWarning: string | null = null;
  if (workspace && quoteId) {
    try {
      const { data: quoteRow, error: quoteError } = await supabase
        .from<CallsQuoteSummary>("quotes")
        .select("id, status, total")
        .eq("workspace_id", workspace.id)
        .eq("id", quoteId)
        .maybeSingle();
      if (quoteError) {
        console.error("[calls/new] Quote lookup failed:", quoteError);
        newCallQuoteWarning = "We couldn’t load this quote right now.";
      }
      newCallQuote = quoteRow ?? null;
      if (!quoteRow) {
        newCallQuoteWarning = "We couldn’t find this quote in your workspace.";
      }
    } catch (error) {
      console.error("[calls/new] Quote query error:", error);
      newCallQuoteWarning = "We couldn’t find this quote in your workspace.";
    }
  }

  const jobLabel = newCallJob
    ? newCallJob.title ?? `Job ${newCallJob.id.slice(0, 8)}…`
    : jobId
    ? `Job ${jobId.slice(0, 8)}…`
    : null;
  const quoteLabel = newCallQuote
    ? newCallQuote.total != null
      ? `Quote ${newCallQuote.id.slice(0, 8)}… · total ${newCallQuote.total}`
      : `Quote ${newCallQuote.id.slice(0, 8)}…`
    : quoteId
    ? `Quote ${quoteId.slice(0, 8)}…`
    : null;

  quoteIdForForm = quoteId ?? newCallQuote?.id ?? null;
  const jobReferenceLabel = jobLabel ?? "this job";
  const workspaceFromNumber = normalizeCandidate(workspaceBusinessPhone);
  const displayFromNumber = workspaceFromNumber ?? "Not yet configured";
  const displayFromHelper = workspaceFromNumber
    ? null
    : "We’ll fall back to your workspace default when telephony is configured.";
  const relatedCustomer =
    newCallJob && newCallJob.customers
      ? Array.isArray(newCallJob.customers) && newCallJob.customers.length > 0
        ? newCallJob.customers[0]
        : newCallJob.customers
      : null;
  const normalizedCustomerPhone = normalizeCandidate(relatedCustomer?.phone ?? null);
  const displayToNumber = normalizedCustomerPhone ?? "No customer phone on file";
  const displayToHelper = normalizedCustomerPhone
    ? null
    : "Add a phone number to this customer to make this call fully actionable later.";

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calls</p>
        <h1 className="hb-heading-1 text-3xl font-semibold">Log a new call</h1>
        <p className="hb-muted text-sm">
          Create the call workspace below and you’ll be redirected to the guided session for this job.
        </p>
      </header>
      {(jobLabel || newCallJobWarning || quoteLabel || newCallQuoteWarning) && (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
          {jobLabel && <p>This new call will be linked to job {jobLabel}.</p>}
          {newCallJobWarning && (
            <p className="text-xs text-amber-200">{newCallJobWarning}</p>
    )}
      {showAskBobScriptHint && (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob call script</p>
          <p className="text-sm text-slate-400">
            This script was drafted by AskBob for this job. Review and adjust before calling.
          </p>
          {scriptSummaryForForm && (
            <p className="text-xs text-slate-400 mt-2">Summary: {scriptSummaryForForm}</p>
          )}
        </div>
      )}
          {quoteLabel && <p>Quote: {quoteLabel}</p>}
          {newCallQuoteWarning && (
            <p className="text-xs text-amber-200">{newCallQuoteWarning}</p>
          )}
        </div>
      )}
      {process.env.NODE_ENV !== "production" && (
        <p className="text-[11px] text-slate-500">
          Debug: jobId={debugJobId} · lookup{" "}
          {hasJobId ? (newCallJob ? "found" : "returned no rows") : "not requested"}
        </p>
      )}
      <HbCard className="space-y-4">
        <div className="space-y-2 text-sm text-slate-400">
          <p>
            Create a workspace for {jobReferenceLabel} so you can run the guided call workspace and capture
            the summary for this job.
          </p>
          {quoteLabel && <p>This workspace will also link to {quoteLabel}.</p>}
          <p>We’ll open the workspace once the record is created so you can use the two-column layout.</p>
        </div>
        <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/30 p-4 text-sm text-slate-100">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call endpoints</p>
          <div className="flex items-center justify-between text-sm text-slate-300">
            <span>From</span>
            <span className="font-semibold text-slate-100">{displayFromNumber}</span>
          </div>
          {displayFromHelper && (
            <p className="text-xs text-amber-200">{displayFromHelper}</p>
          )}
          <div className="flex items-center justify-between text-sm text-slate-300">
            <span>To</span>
            <span className="font-semibold text-slate-100">{displayToNumber}</span>
          </div>
          {displayToHelper && <p className="text-xs text-amber-200">{displayToHelper}</p>}
        </div>
        {hasJobId ? (
          <form action={createCallWorkspaceAction} className="space-y-4">
            {jobIdForForm && <input type="hidden" name="jobId" value={jobIdForForm} />}
            {quoteIdForForm && <input type="hidden" name="quoteId" value={quoteIdForForm} />}
            {customerIdForForm && (
              <input type="hidden" name="customerId" value={customerIdForForm} />
            )}
            {originParam && <input type="hidden" name="origin" value={originParam} />}
            {showAskBobScriptHint && (
              <label className="space-y-2 text-sm text-slate-200">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Call script</span>
                <textarea
                  name="scriptBody"
                  rows={6}
                  defaultValue={scriptBodyForForm ?? ""}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-slate-600 focus:outline-none"
                  placeholder="Paste or review your AskBob script before launching the call workspace."
                />
                <p className="text-[11px] text-slate-400">
                  Review and update this script as needed, and we’ll use it as the call notes when the
                  workspace opens.
                </p>
              </label>
            )}
            <HbButton className="w-full" type="submit">
              Create call workspace
            </HbButton>
          </form>
        ) : (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p>
              Provide a job ID in the URL (e.g., from a job page) so you can create a call workspace.
            </p>
          </div>
        )}
        <div className="flex gap-3">
          <HbButton as={Link} href="/calls" size="sm" variant="secondary">
            Back to calls list
          </HbButton>
        </div>
      </HbCard>
    </div>
  );
}
