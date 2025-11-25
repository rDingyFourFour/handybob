// Authenticated dashboard page; expects a signed-in user and loads workspace context via createServerClient + getCurrentWorkspace.
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatCurrency } from "@/utils/timeline/formatters";
import { DEFAULT_TIMEZONE } from "@/utils/dashboard/time";
import { AppointmentsSkeleton } from "@/components/dashboard/AppointmentsSkeleton";
import { MessagesSkeleton } from "@/components/dashboard/MessagesSkeleton";
import { ActivitySkeleton } from "@/components/dashboard/ActivitySkeleton";
import { LeadsAttentionList } from "@/components/dashboard/LeadsAttentionList";
import { QuotesAttentionList } from "@/components/dashboard/QuotesAttentionList";
import { InvoicesAttentionList } from "@/components/dashboard/InvoicesAttentionList";
import { CallsAttentionList } from "@/components/dashboard/CallsAttentionList";
import { InboxPreviewWidget } from "@/components/dashboard/InboxPreviewWidget";
import { RecentActivityWidget } from "@/components/dashboard/RecentActivityWidget";
import { AppointmentsWidget } from "@/components/dashboard/AppointmentsWidget";
import { getAttentionItems, getAttentionCutoffs } from "@/lib/domain/attention";

export const dynamic = "force-dynamic";

type AutomationPrefs = {
  notifyUrgentLeads: boolean;
  showOverdueWork: boolean;
};

type AutomationPreferencesRow = {
  notify_urgent_leads?: boolean | null;
  show_overdue_work?: boolean | null;
};

type CallReviewRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  from_number?: string | null;
  priority?: string | null;
  needs_followup?: boolean | null;
  attention_reason?: string | null;
  ai_urgency?: string | null;
  jobs?: { id: string; title: string | null } | { id: string; title: string | null }[] | null;
  customers?: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
};

type OverdueInvoiceRow = {
  id: string;
  status: string | null;
  total: number | null;
  due_at: string | null;
  job_id?: string | null;
  job?: { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null } | { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null }[] | null;
};

type StaleQuoteRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  job_id?: string | null;
  job?: { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null } | { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null }[] | null;
};

type MessageThreadRow = {
  id: string;
  direction: string | null;
  subject: string | null;
  body: string | null;
  created_at: string | null;
  sent_at: string | null;
  customer_id?: string | null;
  job_id?: string | null;
  job?: { title: string | null } | { title: string | null }[] | null;
  customers?: { id: string | null; name: string | null } | { id: string | null; name: string | null }[] | null;
};

export async function updateAutomationPreferences(formData: FormData) {
  "use server";
  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const notifyUrgentLeads = formData.get("notifyUrgentLeads") === "on";
  const showOverdueWork = formData.get("showOverdueWork") === "on";

  await supabase
    .from("automation_preferences")
    .upsert({
      workspace_id: workspace.id,
      notify_urgent_leads: notifyUrgentLeads,
      show_overdue_work: showOverdueWork,
    })
    .select("workspace_id")
    .single();

  revalidatePath("/dashboard");
}

export async function retryDashboardData() {
  "use server";
  revalidatePath("/dashboard");
}

const onboardingSteps = [
  {
    title: "Add your business details",
    description: "Personalize your workspace name, payment info, and public messaging.",
    href: "/settings/workspace",
  },
  {
    title: "Add your first customer",
    description: "Capture a contact so jobs, quotes, and calls have a home.",
    href: "/customers/new",
  },
  {
    title: "Create your first job",
    description: "Track leads, quotes, and schedules in one tidy job record.",
    href: "/jobs/new",
  },
  {
    title: "Generate your first quote with AI",
    description: "Use the AI assistant to scope work and send a proposal.",
    href: "/quotes",
  },
  {
    title: "Turn on your public booking link",
    description: "Share a link so customers can request service directly.",
    href: "/settings/workspace",
  },
];


export default async function DashboardPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[dashboard] Failed to init Supabase client:", error);
    return (
      <div className="hb-card">
        <h1>Dashboard unavailable</h1>
        <p className="hb-muted text-sm">Could not connect to Supabase. Check environment keys.</p>
      </div>
    );
  }

  let workspace;
  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[dashboard] Failed to resolve workspace:", error);
    return (
      <div className="hb-card">
        <h1>Dashboard unavailable</h1>
        <p className="hb-muted text-sm">Unable to resolve workspace. Please sign in again.</p>
      </div>
    );
  }

  if (!user) {
    redirect("/");
  }

  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[dashboard] Failed to resolve workspace:", error);
    return (
      <div className="hb-card">
        <h1>Dashboard unavailable</h1>
        <p className="hb-muted text-sm">Unable to resolve workspace. Please sign in again.</p>
      </div>
    );
  }

  const workspaceTimeZone =
    (workspace as { timezone?: string | null }).timezone ?? DEFAULT_TIMEZONE;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayEndIso = todayEnd.toISOString();

  const dayAgo = new Date();
  dayAgo.setHours(dayAgo.getHours() - 24);

  const monthStart = new Date(todayStart);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(monthStart.getMonth() + 1);

  // Attention model cutoffs (centralized in lib/domain/attention)
  const {
    newLeadWindowStart,
    staleQuoteCutoff: quoteStaleThreshold,
    overdueInvoiceCutoff: invoiceOverdueThreshold,
  } = await getAttentionCutoffs(todayStart);
  // Attention cards pull:
  // - Calls needing review: calls missing transcript/summary/job_id or flagged needs_followup.
  // - Overdue invoices / stale quotes: status filters plus date thresholds above.
  // Automation prefs control visibility of overdue work blocks.

  let leadsRes,
    pendingQuotesRes,
    unpaidInvoicesRes,
    paidQuotesThisMonthRes,
    paidInvoicesThisMonthRes,
    inboundMessagesRes,
    callsNeedingReviewRes,
    overdueInvoicesRes,
    staleQuotesRes,
    automationPrefsRes;
  let workspaceCustomersCountRes,
    workspaceJobsCountRes;

  try {
    [
      leadsRes,
      pendingQuotesRes,
      unpaidInvoicesRes,
      paidQuotesThisMonthRes,
      paidInvoicesThisMonthRes,
      inboundMessagesRes,
      callsNeedingReviewRes,
      overdueInvoicesRes,
      staleQuotesRes,
      automationPrefsRes,
      workspaceCustomersCountRes,
      workspaceJobsCountRes,
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("status", "lead")
        .gte("created_at", newLeadWindowStart.toISOString()),

      supabase.from("quotes").select("id").eq("workspace_id", workspace.id).eq("status", "sent"),

      supabase
        .from("invoices")
        .select("id")
        .eq("workspace_id", workspace.id)
        .in("status", ["sent", "overdue"]),

      supabase
        .from("quotes")
        .select("id, total, paid_at")
        .eq("workspace_id", workspace.id)
        .eq("status", "paid")
        .gte("paid_at", monthStart.toISOString())
        .lt("paid_at", nextMonthStart.toISOString()),

      supabase
        .from("invoices")
        .select("id, total, paid_at")
        .eq("workspace_id", workspace.id)
        .eq("status", "paid")
        .gte("paid_at", monthStart.toISOString())
        .lt("paid_at", nextMonthStart.toISOString()),

      supabase
        .from("messages")
        .select(
          `
            id,
            direction,
            subject,
            body,
            customer_id,
            job_id,
            sent_at,
            created_at,
            job:jobs ( title ),
            customers ( id, name )
          `
        )
        .eq("workspace_id", workspace.id)
        .eq("direction", "inbound")
        .gte("created_at", dayAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(12),

      supabase
        .from("jobs")
        .select("id, title, urgency, source, ai_urgency, priority, attention_score, attention_reason, created_at, customer:customers(name)")
        .eq("workspace_id", workspace.id)
        .eq("status", "lead")
        .gte("created_at", newLeadWindowStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(15),

      supabase
        .from("calls")
        .select(
          `
            id,
            status,
            created_at,
            from_number,
            priority,
            needs_followup,
            attention_reason,
            ai_urgency,
            job_id,
            jobs ( id, title ),
            customers ( id, name )
          `
        )
        .eq("workspace_id", workspace.id)
        .or("transcript.is.null,ai_summary.is.null,job_id.is.null,needs_followup.eq.true")
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("invoices")
        .select(
          `
            id,
            status,
            total,
            due_at,
            job_id,
            job:jobs (
              title,
              customers ( name )
            )
          `
        )
        .eq("workspace_id", workspace.id)
        .in("status", ["sent", "overdue"])
        .lt("due_at", invoiceOverdueThreshold.toISOString())
        .order("due_at", { ascending: true })
        .limit(10),

      supabase
        .from("quotes")
        .select(
          `
            id,
            status,
            total,
            created_at,
            job_id,
            job:jobs (
              title,
              customers ( name )
            )
          `
        )
        .eq("workspace_id", workspace.id)
        .eq("status", "sent")
        .lt("created_at", quoteStaleThreshold.toISOString())
        .order("created_at", { ascending: true })
        .limit(10),

      supabase
        .from("automation_preferences")
        .select("notify_urgent_leads, show_overdue_work")
        .eq("workspace_id", workspace.id)
        .maybeSingle(),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id),
    ]);
  } catch (error) {
    console.error("[dashboard] Failed to load dashboard data:", error);
    return (
      <div className="hb-card">
        <h1>Dashboard unavailable</h1>
        <p className="hb-muted text-sm">Could not load workspace data. Please retry.</p>
      </div>
    );
  }

  const paidQuotes =
    (paidQuotesThisMonthRes.data ?? []) as { id: string; total: number | null }[];
  const paidQuotesCount = paidQuotes.length;
  const collectedThisMonth = paidQuotes.reduce(
    (sum, quote) => sum + Number(quote.total ?? 0),
    0
  );

  const inboundMessages = (inboundMessagesRes.data ?? []) as MessageThreadRow[];
  const inboundThreadsMap = new Map<string, MessageThreadRow>();
  for (const msg of inboundMessages) {
    const key = msg.customer_id ?? msg.job_id ?? msg.id;
    if (!key || inboundThreadsMap.has(key)) continue;
    inboundThreadsMap.set(key, msg);
  }
  const inboundMessagesCount = inboundThreadsMap.size;

  const paidInvoices =
    (paidInvoicesThisMonthRes.data ?? []) as { id: string; total: number | null }[];
  const paidInvoicesCount = paidInvoices.length;
  const collectedInvoicesThisMonth = paidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total ?? 0),
    0
  );

  const automationPrefsRow = (automationPrefsRes as { data: AutomationPreferencesRow | null }).data;

  const prefs: AutomationPrefs = {
    notifyUrgentLeads: automationPrefsRow?.notify_urgent_leads ?? true,
    showOverdueWork: automationPrefsRow?.show_overdue_work ?? true,
  };

  const attentionItems = await getAttentionItems(workspace.id, {
    workspaceTimeZone,
  });
  const callsNeedingReviewRaw = (callsNeedingReviewRes.data ?? []) as CallReviewRow[];
  const callsNeedingReview = callsNeedingReviewRaw.map((call) => ({
    ...call,
    jobs: Array.isArray(call.jobs) ? call.jobs[0] ?? null : call.jobs ?? null,
    customers: Array.isArray(call.customers) ? call.customers[0] ?? null : call.customers ?? null,
  }));
  const overdueInvoicesRaw = (overdueInvoicesRes.data ?? []) as OverdueInvoiceRow[];
  const overdueInvoices = overdueInvoicesRaw.map((inv) => ({
    ...inv,
    job: Array.isArray(inv.job) ? inv.job[0] ?? null : inv.job ?? null,
  }));
  const staleQuotesRaw = (staleQuotesRes.data ?? []) as StaleQuoteRow[];
  const staleQuotes = staleQuotesRaw.map((quote) => ({
    ...quote,
    job: Array.isArray(quote.job) ? quote.job[0] ?? null : quote.job ?? null,
  }));
  const invoiceLoadFailed =
    Boolean(overdueInvoicesRes.error) || Boolean(paidInvoicesThisMonthRes.error);

  const workspaceCustomersCount = workspaceCustomersCountRes.count ?? 0;
  const workspaceJobsCount = workspaceJobsCountRes.count ?? 0;
  const isWorkspaceEmpty =
    workspaceCustomersCount === 0 && workspaceJobsCount === 0;

  if (isWorkspaceEmpty) {
    return (
      <div className="space-y-4">
        <div className="hb-card space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Getting started</p>
            <h1 className="text-2xl font-semibold">Let&apos;s get your HandyBob office set up.</h1>
            <p className="hb-muted text-sm">
              Complete these steps to see the dashboard spark with activity.
            </p>
          </div>

          <ol className="space-y-3 text-left">
            {onboardingSteps.map((step, index) => (
              <Link
                key={step.title}
                href={step.href}
                className="group flex items-start gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 px-4 py-4 transition hover:border-slate-600"
              >
                <span className="min-w-[28px] text-right text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {index + 1}
                </span>
                <div>
                  <p className="text-base font-semibold text-slate-100">{step.title}</p>
                  <p className="text-sm text-slate-400">{step.description}</p>
                </div>
              </Link>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  const attentionCount =
    (leadsRes.data?.length ?? 0) +
    callsNeedingReview.length +
    (prefs.showOverdueWork ? overdueInvoices.length + staleQuotes.length : 0);

  const urgentEmergencyCount = attentionItems.urgentEmergencyCount;
  const leadSourceCounts = attentionItems.leadSourceCounts;

  return (
    <div className="space-y-6 relative">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Workspace</p>
          <div className="flex items-center gap-2">
            <span className="hb-heading-1 text-2xl font-semibold">{workspace.name ?? "Workspace"}</span>
            <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
              Welcome, {workspace.name ? workspace.name.split(" ")[0] : "handypeople"}
            </span>
          </div>
          <p className="hb-muted">Today&apos;s work at a glance.</p>
        </div>
        <Link href="/jobs/new" className="hb-button px-4 py-2 text-sm">
          New job
        </Link>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="hb-heading-2">Today</h2>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Daily check-in</p>
        </div>
        <div className="space-y-4">
          <div className="hb-card space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="hb-card-heading text-2xl font-bold tracking-tight">Today&apos;s appointments</h3>
                <p className="hb-muted text-sm">Quick view of your day.</p>
              </div>
              <div className="flex gap-2 text-xs">
                <Link href="/appointments" className="hb-button-ghost">
                  View all
                </Link>
                <Link href="/calendar" className="hb-button-ghost">
                  Calendar
                </Link>
              </div>
            </div>

            <Suspense fallback={<AppointmentsSkeleton rows={3} />}>
              <AppointmentsWidget
                workspaceId={workspace.id}
                workspaceTimeZone={workspaceTimeZone}
                todayEndIso={todayEndIso}
              />
            </Suspense>
          </div>

          <div className="hb-card space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="hb-card-heading">Messages needing response</h3>
                <p className="hb-muted text-sm">Inbound threads awaiting reply.</p>
              </div>
              <Link href="/inbox" className="hb-button-ghost text-xs">
                Open inbox
              </Link>
            </div>

            <Suspense fallback={<MessagesSkeleton rows={3} />}>
              <InboxPreviewWidget
                workspaceId={workspace.id}
                workspaceTimeZone={workspaceTimeZone}
                windowStartIso={dayAgo.toISOString()}
              />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="hb-heading-2">This Week</h2>
          <p className="hb-muted">Pipeline, billing, and automation highlights.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="hb-card space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="hb-card-heading">New leads</h3>
              <Link href="/jobs?status=lead" className="hb-button-ghost text-xs">
                View leads
              </Link>
            </div>
            <p className="text-2xl font-semibold">{leadsRes.data?.length ?? 0}</p>
            <p className="text-xs text-slate-400">From calls and web form submissions.</p>
            <p className="text-[11px] text-slate-500">
              Web: {leadSourceCounts.web} · Calls: {leadSourceCounts.calls} · Manual: {leadSourceCounts.manual} · Other: {leadSourceCounts.other}
            </p>
          </div>
          <div className="hb-card">
            <h3 className="hb-card-heading">Pending quotes</h3>
            <p className="text-2xl font-semibold">{pendingQuotesRes.data?.length ?? 0}</p>
          </div>
          <div className="hb-card">
            <h3 className="hb-card-heading">Unpaid invoices</h3>
            <p className="text-2xl font-semibold">{unpaidInvoicesRes.data?.length ?? 0}</p>
          </div>
          <div className="hb-card">
            <h3 className="hb-card-heading">Inbound messages (24h)</h3>
            <p className="text-2xl font-semibold">{inboundMessagesCount}</p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="hb-card">
            <h3 className="hb-card-heading">Paid quotes this month</h3>
            <p className="text-2xl font-semibold">{paidQuotesCount}</p>
          </div>
          <div className="hb-card">
            <h3 className="hb-card-heading">Quote revenue this month</h3>
            <p className="text-2xl font-semibold">{formatCurrency(collectedThisMonth)}</p>
          </div>
          <div className="hb-card">
            <h3 className="hb-card-heading">Invoices paid this month</h3>
            <p className="text-2xl font-semibold">{paidInvoicesCount}</p>
          </div>
          <div className="hb-card">
            <h3 className="hb-card-heading">Total collected this month</h3>
            <p className="text-2xl font-semibold">
              {formatCurrency(collectedThisMonth + collectedInvoicesThisMonth)}
            </p>
          </div>
        </div>

        {invoiceLoadFailed && (
          <div className="hb-card space-y-2">
            <p className="font-semibold text-slate-100">Unable to load invoices right now.</p>
            <form action={retryDashboardData}>
              <button type="submit" className="hb-button px-3 py-1 text-sm">
                Retry
              </button>
            </form>
          </div>
        )}

        <div className="hb-card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="hb-card-heading">Automations</h3>
              <p className="hb-muted text-sm">Toggle alerts for urgent leads and overdue work.</p>
            </div>
            <Link href="/settings" className="hb-button-ghost text-xs">
              Settings
            </Link>
          </div>
          <form action={updateAutomationPreferences} className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="notifyUrgentLeads"
                defaultChecked={prefs.notifyUrgentLeads}
                className="hb-checkbox"
              />
              <span>Notify me about urgent leads</span>
            </label>
            <p className="hb-muted text-xs">
              Highlights leads marked as emergency/urgent and keeps them pinned in the attention row.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="showOverdueWork"
                defaultChecked={prefs.showOverdueWork}
                className="hb-checkbox"
              />
              <span>Show overdue invoices and stale quotes</span>
            </label>
            <p className="hb-muted text-xs">
              Hide or show overdue billing work in the dashboard queue.
            </p>
            <button type="submit" className="hb-button mt-2 text-sm">
              Save automations
            </button>
          </form>
          <div className="rounded border border-slate-800 px-3 py-2 text-xs text-slate-400">
            Automations run server-side, keeping RLS in place. No external calls required.
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="hb-card space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="hb-card-heading">Recent activity</h3>
              <p className="text-xs text-slate-400">Last 5 events across jobs</p>
            </div>
            <Link href="/jobs?tab=timeline" className="hb-button-ghost text-xs">
              View timeline
            </Link>
          </div>
          <Suspense fallback={<ActivitySkeleton rows={5} />}>
            <RecentActivityWidget workspaceId={workspace.id} workspaceTimeZone={workspaceTimeZone} />
          </Suspense>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Attention Needed</h2>
          <p className="text-sm text-slate-400">Work trending toward urgency.</p>
        </div>
        <div className="hb-card space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="hb-card-heading">Attention</h3>
              <p className="hb-muted text-sm">Quick triage of work that needs action.</p>
            </div>
            <div className="flex items-center gap-2">
              {urgentEmergencyCount > 0 ? (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-red-200">
                  Emergency {urgentEmergencyCount}
                </span>
              ) : null}
              <div className="rounded-lg bg-slate-900 px-3 py-2 text-right">
                <p className="text-xs uppercase text-slate-500">Open items</p>
                <p className="text-2xl font-semibold">{attentionCount}</p>
              </div>
            </div>
          </div>
          <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-200 flex items-center justify-between">
            <span>
              You have {urgentEmergencyCount} urgent lead{urgentEmergencyCount === 1 ? "" : "s"} (AI urgency: emergency).
            </span>
            <Link href="/jobs?status=lead&ai_urgency=emergency" className="hb-button-ghost text-xs">
              View urgent leads
            </Link>
          </div>
          <div className="grid gap-5 xl:grid-cols-4 md:grid-cols-2">
          <AttentionCard title="New leads (7 days)" count={leadsRes.data?.length ?? 0} href="/jobs">
            <LeadsAttentionList items={attentionItems.leads} />
          </AttentionCard>
          <AttentionCard
            title="Overdue invoices"
            count={overdueInvoices.length}
            href="/invoices"
            badge="Overdue"
            badgeClassName="border border-red-500/30 bg-red-500/10 text-red-200"
          >
            <InvoicesAttentionList items={attentionItems.invoices} />
          </AttentionCard>
          <AttentionCard title="Quotes to follow up" count={staleQuotes.length} href="/quotes">
            <QuotesAttentionList items={attentionItems.quotes} />
          </AttentionCard>
          <AttentionCard
            title="Incomplete tasks"
            count={callsNeedingReview.length}
            href="/calls?filter=needs_processing"
            badge="Unprocessed"
            badgeClassName="border border-amber-500/30 bg-amber-500/10 text-amber-200"
          >
            <CallsAttentionList items={attentionItems.calls} />
          </AttentionCard>
          </div>
        </div>
      </section>
    </div>
  );
}

function AttentionCard({
  title,
  count,
  href,
  badge,
  badgeClassName,
  children,
}: {
  title: string;
  count: number;
  href: string;
  badge?: string;
  badgeClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="hb-card space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="hb-card-heading">{title}</h3>
          <p className="text-2xl font-semibold text-slate-100">{count}</p>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] ${badgeClassName}`}>
              {badge}
            </span>
          )}
          <Link href={href} className="hb-button-ghost text-xs">
            View
          </Link>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
