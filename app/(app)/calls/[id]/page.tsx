export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type CallRecord = {
  id: string;
  workspace_id: string;
  from_number: string | null;
  status: string | null;
  priority: string | null;
  needs_followup: boolean | null;
  attention_reason: string | null;
  ai_urgency: string | null;
  created_at: string | null;
  job_id: string | null;
  jobs: { id: string | null; title: string | null } | Array<{ id: string | null; title: string | null }> | null;
  customers:
    | { id: string | null; name: string | null }
    | Array<{ id: string | null; name: string | null }>
    | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fallbackCard(title: string, body: string) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <HbButton as="a" href="/calls" size="sm">
          Back to calls
        </HbButton>
      </HbCard>
    </div>
  );
}

function buildQuoteParams(jobId: string, description?: string | null) {
  const params = new URLSearchParams();
  params.set("jobId", jobId);
  params.set("source", "job");
  const trimmed = (description ?? "").trim();
  if (trimmed) {
    params.set("description", trimmed);
  }
  return params.toString();
}

export default async function CallDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  if (!id || !id.trim()) {
    notFound();
  }

  if (id === "new") {
    redirect("/calls/new");
    return null;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[call-detail] Unable to init Supabase client", error);
    return fallbackCard("Something went wrong", "We couldn’t load this page. Try again or go back.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
    return null;
  }

  let workspace;
  try {
    const workspaceResult = await getCurrentWorkspace({ supabase });
    workspace = workspaceResult.workspace;
  } catch (error) {
    console.error("[call-detail] Failed to resolve workspace", error);
    return fallbackCard("Something went wrong", "We couldn’t load this page. Try again or go back.");
  }

  if (!workspace) {
    return fallbackCard("Call unavailable", "Unable to resolve workspace. Please try again.");
  }

  let call: CallRecord | null = null;

  try {
    const { data, error } = await supabase
      .from<CallRecord>("calls")
      .select(
        `
          id,
          workspace_id,
          from_number,
          status,
          priority,
          needs_followup,
          attention_reason,
          ai_urgency,
          created_at,
          job_id,
          jobs(id, title),
          customers(id, name)
        `
      )
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[call-detail] Call lookup failed:", error);
      return fallbackCard("Call not found", "We couldn’t find that call. It may have been deleted.");
    }

    call = data ?? null;
  } catch (error) {
    console.error("[call-detail] Call query error:", error);
    return fallbackCard("Call not found", "We couldn’t find that call. It may have been deleted.");
  }

  if (!call) {
    return fallbackCard("Call not found", "We couldn’t find that call. It may have been deleted.");
  }

  const job =
    Array.isArray(call.jobs) && call.jobs.length > 0 ? call.jobs[0] : call.jobs ?? null;
  const customer =
    Array.isArray(call.customers) && call.customers.length > 0 ? call.customers[0] : call.customers ?? null;

  const jobTitle = job?.title ?? null;
  const jobId = job?.id ?? call.job_id ?? null;
  const quoteHref =
    jobId && jobId.trim()
      ? `/quotes/new?${buildQuoteParams(
          jobId,
          call.attention_reason ?? call.from_number ?? jobTitle,
        )}`
      : null;
  const customerName = customer?.name ?? null;
  const customerId = customer?.id ?? null;

  const needsFollowUp =
    call.needs_followup === null ? "No" : call.needs_followup ? "Yes" : "No";

  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call details</p>
            <h1 className="hb-heading-2 text-2xl font-semibold">Call {call.id.slice(0, 8)}</h1>
            <p className="text-sm text-slate-400">
              Status: {call.status ?? "—"} · {call.from_number ?? "Unknown source"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HbButton as="a" href="/calls" size="sm">
              Back to calls
            </HbButton>
            {quoteHref && (
              <HbButton as={Link} href={quoteHref} variant="secondary" size="sm">
                Generate quote for this job
              </HbButton>
            )}
            <HbButton as="a" href="/calls/new" variant="secondary" size="sm">
              Log new call
            </HbButton>
          </div>
        </header>
        <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-2">
          <p>From number: {call.from_number ?? "Unknown"}</p>
          <p>Status: {call.status ?? "—"}</p>
          <p>Priority: {call.priority ?? "—"}</p>
          <p>Needs follow-up: {needsFollowUp}</p>
          <p>Attention reason: {call.attention_reason ?? "—"}</p>
          <p>AI urgency: {call.ai_urgency ?? "—"}</p>
          <p>Created: {formatDate(call.created_at)}</p>
          {jobTitle && jobId && (
            <p>
              Job:{" "}
              <Link href={`/jobs/${jobId}`} className="text-sky-300 hover:text-sky-200">
                {jobTitle}
              </Link>
            </p>
          )}
          {customerName && customerId && (
            <p>
              Customer:{" "}
              <Link href={`/customers/${customerId}`} className="text-sky-300 hover:text-sky-200">
                {customerName}
              </Link>
            </p>
          )}
        </div>
      </HbCard>
    </div>
  );
}
