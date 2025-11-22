// app/page.tsx
import Link from "next/link";
import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";
import { newLeadCutoff, overdueInvoiceCutoff, staleQuoteCutoff } from "@/utils/attention/attentionModel";

export const dynamic = "force-dynamic";

type AutomationPrefs = {
  notifyUrgentLeads: boolean;
  showOverdueWork: boolean;
};

type UrgentLeadRow = {
  id: string;
  title: string | null;
  urgency: string | null;
  source?: string | null;
  priority?: string | null;
  ai_urgency?: string | null;
  attention_score?: number | null;
  attention_reason?: string | null;
  customer: { name: string | null }[] | null;
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
  job?: { title: string | null } | { title: string | null }[] | null;
};

type StaleQuoteRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  job_id?: string | null;
  job?: { title: string | null } | { title: string | null }[] | null;
};

type AppointmentRow = {
  id: string;
  title: string | null;
  start_time: string | null;
  jobs:
    | { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null }
    | { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null }[]
    | null;
};

export async function updateAutomationPreferences(formData: FormData) {
  "use server";
  const supabase = createServerClient();
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

  revalidatePath("/");
}

function formatTime(date: string | null) {
  if (!date) return "";
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: string | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCurrency(amount: number | null | undefined) {
  const value = Number(amount ?? 0);
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function daysSince(date: string | null) {
  if (!date) return null;
  const now = Date.now();
  const then = new Date(date).getTime();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

const AI_URGENCY_ORDER = ["emergency", "urgent", "this_week", "soon", "flexible"];
function aiUrgencyRank(value?: string | null) {
  const idx = AI_URGENCY_ORDER.indexOf((value ?? "").toLowerCase());
  return idx === -1 ? AI_URGENCY_ORDER.length : idx;
}

function formatSource(source?: string | null) {
  const value = (source || "").toLowerCase();
  if (value === "web_form") return "Web form";
  if (value === "voicemail") return "Phone/voicemail";
  if (value === "manual") return "Manual";
  if (!value) return "Lead";
  return value.replace(/_/g, " ");
}

export default async function HomePage() {
  let supabase;
  try {
    supabase = createServerClient();
  } catch (error) {
    console.error("[home] Failed to init Supabase client:", error);
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
    if (!user) {
      return (
        <div className="hb-card space-y-2">
          <h1>Welcome to HandyBob</h1>
          <p className="hb-muted text-sm">Please sign in to view your dashboard.</p>
          <Link href="/login" className="hb-button text-sm w-fit">
            Sign in
          </Link>
        </div>
      );
    }
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[home] Failed to resolve workspace:", error);
    return (
      <div className="hb-card">
        <h1>Dashboard unavailable</h1>
        <p className="hb-muted text-sm">Unable to resolve workspace. Please sign in again.</p>
      </div>
    );
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const dayAgo = new Date();
  dayAgo.setHours(dayAgo.getHours() - 24);

  const monthStart = new Date(todayStart);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(monthStart.getMonth() + 1);

  // Attention model cutoffs (see utils/attention/attentionModel.ts)
  const newLeadWindowStart = newLeadCutoff(todayStart);
  const quoteStaleThreshold = staleQuoteCutoff(todayStart);
  const invoiceOverdueThreshold = overdueInvoiceCutoff(todayStart);
  // Attention cards pull:
  // - New leads: status=lead created within newLeadWindowStart.
  // - Urgent leads: lead rows (status=lead) scoped to workspace, ordered by created_at; urgency surface comes from ai_urgency/urgency.
  // - Calls needing review: calls missing transcript/summary/job_id or flagged needs_followup.
  // - Overdue invoices / stale quotes: status filters plus date thresholds above.
  // Automation prefs control visibility of overdue work blocks.

  let appointmentsRes,
    leadsRes,
    pendingQuotesRes,
    unpaidInvoicesRes,
    paidQuotesThisMonthRes,
    paidInvoicesThisMonthRes,
    inboundMessagesRes,
    urgentLeadsRes,
    callsNeedingReviewRes,
    overdueInvoicesRes,
    staleQuotesRes,
    automationPrefsRes;

  try {
    [
      appointmentsRes,
      leadsRes,
      pendingQuotesRes,
      unpaidInvoicesRes,
      paidQuotesThisMonthRes,
      paidInvoicesThisMonthRes,
      inboundMessagesRes,
      urgentLeadsRes,
      callsNeedingReviewRes,
      overdueInvoicesRes,
      staleQuotesRes,
      automationPrefsRes,
    ] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          `
            id,
            title,
            start_time,
            jobs ( title )
          `
        )
        .eq("workspace_id", workspace.id)
        .lte("start_time", todayEnd.toISOString())
        .neq("status", "completed")
        .order("start_time", { ascending: true })
        .limit(15),

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
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("direction", "inbound")
        .gte("sent_at", dayAgo.toISOString()),

      supabase
        .from("jobs")
        .select("id, title, urgency, source, ai_urgency, priority, attention_score, attention_reason, customer:customers(name)")
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
        .select("id, status, total, due_at, job_id, job:jobs(title)")
        .eq("workspace_id", workspace.id)
        .in("status", ["sent", "overdue"])
        .lt("due_at", invoiceOverdueThreshold.toISOString())
        .order("due_at", { ascending: true })
        .limit(10),

      supabase
        .from("quotes")
        .select("id, status, total, created_at, job_id, job:jobs(title)")
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
    ]);
  } catch (error) {
    console.error("[home] Failed to load dashboard data:", error);
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

  const inboundMessagesCount = inboundMessagesRes.data?.length ?? 0;

  const paidInvoices =
    (paidInvoicesThisMonthRes.data ?? []) as { id: string; total: number | null }[];
  const paidInvoicesCount = paidInvoices.length;
  const collectedInvoicesThisMonth = paidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total ?? 0),
    0
  );

  const todaysAppointments = (appointmentsRes.data ?? []) as AppointmentRow[];

  const prefs: AutomationPrefs = {
    notifyUrgentLeads: automationPrefsRes.data?.notify_urgent_leads ?? true,
    showOverdueWork: automationPrefsRes.data?.show_overdue_work ?? true,
  };

  const urgentLeads = (urgentLeadsRes.data ?? []) as UrgentLeadRow[];
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

  const attentionCount =
    (leadsRes.data?.length ?? 0) +
    callsNeedingReview.length +
    (prefs.showOverdueWork ? overdueInvoices.length + staleQuotes.length : 0);

  const topLeads = [...urgentLeads]
    .sort((a, b) => aiUrgencyRank(a.ai_urgency || a.urgency) - aiUrgencyRank(b.ai_urgency || b.urgency))
    .slice(0, 3);
  const topQuotes = staleQuotes.slice(0, 3);
  const topInvoices = overdueInvoices.slice(0, 3);
  const topCalls = callsNeedingReview.slice(0, 3);
  const urgentEmergencyCount = urgentLeads.filter(
    (lead) => (lead.ai_urgency || lead.urgency || "").toLowerCase() === "emergency",
  ).length;
  const leadSourceCounts = urgentLeads.reduce(
    (acc, lead) => {
      const src = (lead.source || "other").toLowerCase();
      if (src === "web_form") acc.web++;
      else if (src === "voicemail") acc.calls++;
      else if (src === "manual") acc.manual++;
      else acc.other++;
      return acc;
    },
    { web: 0, calls: 0, manual: 0, other: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="hb-card space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Attention</h1>
            <p className="hb-muted text-sm">Quick triage of work that needs action.</p>
          </div>
          <div className="rounded-lg bg-slate-900 px-3 py-2 text-right">
            <p className="text-xs uppercase text-slate-500">Open items</p>
            <p className="text-2xl font-semibold">{attentionCount}</p>
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
        <div className="grid gap-3 xl:grid-cols-4 md:grid-cols-2">
          <div className="space-y-1">
            <AttentionCard
              title="New leads (7 days)"
              count={leadsRes.data?.length ?? 0}
              href="/jobs"
              items={topLeads.map((lead) => ({
                id: lead.id,
                primary: lead.title || "Lead",
                secondary: `${lead.customer?.[0]?.name || "Unknown customer"} • ${formatSource(lead.source)}`,
                tag: lead.ai_urgency || lead.urgency || "lead",
                href: `/jobs/${lead.id}`,
              }))}
              empty="No new leads."
            />
            <div className="text-[11px] text-slate-400">
              Web: {leadSourceCounts.web} · Calls: {leadSourceCounts.calls} · Manual: {leadSourceCounts.manual} · Other: {leadSourceCounts.other}
            </div>
          </div>
          <AttentionCard
            title="Quotes to follow up"
            count={staleQuotes.length}
            href="/quotes"
            items={topQuotes.map((quote) => ({
              id: quote.id,
              primary: quote.job?.title || "Quote",
              secondary: `${formatCurrency(quote.total)} · ${daysSince(quote.created_at) ?? "—"} days ago`,
              tag: quote.status || "sent",
              href: `/quotes/${quote.id}`,
            }))}
            empty="No quotes waiting."
          />
          <AttentionCard
            title="Overdue invoices"
            count={overdueInvoices.length}
            href="/invoices"
            items={topInvoices.map((inv) => ({
              id: inv.id,
              primary: inv.job?.title || "Invoice",
              secondary: `${formatCurrency(inv.total)} · ${daysSince(inv.due_at) ?? 0} days overdue`,
              tag: inv.status || "overdue",
              href: `/invoices/${inv.id}`,
            }))}
            empty="No overdue invoices."
          />
          <AttentionCard
            title="Unprocessed calls"
            count={callsNeedingReview.length}
            href="/calls?filter=needs_processing"
            items={topCalls.map((call) => ({
              id: call.id,
              primary: call.from_number || "Unknown number",
              secondary: `${formatDate(call.created_at)} ${formatTime(call.created_at)}`,
              tag: call.ai_urgency || call.priority || "follow-up",
              href: `/calls/${call.id}`,
            }))}
            empty="All calls processed."
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="hb-card">
          <h3>New leads</h3>
          <p className="text-2xl font-semibold">{leadsRes.data?.length ?? 0}</p>
        </div>
        <div className="hb-card">
          <h3>Pending quotes</h3>
          <p className="text-2xl font-semibold">{pendingQuotesRes.data?.length ?? 0}</p>
        </div>
        <div className="hb-card">
          <h3>Unpaid invoices</h3>
          <p className="text-2xl font-semibold">{unpaidInvoicesRes.data?.length ?? 0}</p>
        </div>
        <div className="hb-card">
          <h3>Inbound messages (24h)</h3>
          <p className="text-2xl font-semibold">{inboundMessagesCount}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="hb-card">
          <h3>Paid quotes this month</h3>
          <p className="text-2xl font-semibold">{paidQuotesCount}</p>
        </div>
        <div className="hb-card">
          <h3>Quote revenue this month</h3>
          <p className="text-2xl font-semibold">{formatCurrency(collectedThisMonth)}</p>
        </div>
        <div className="hb-card">
          <h3>Invoices paid this month</h3>
          <p className="text-2xl font-semibold">{paidInvoicesCount}</p>
        </div>
        <div className="hb-card">
          <h3>Total collected this month</h3>
          <p className="text-2xl font-semibold">
            {formatCurrency(collectedThisMonth + collectedInvoicesThisMonth)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="hb-card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3>Today&apos;s appointments</h3>
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

          {todaysAppointments.length === 0 ? (
            <p className="hb-muted text-sm">No appointments scheduled for today.</p>
          ) : (
            <div className="space-y-2">
              {todaysAppointments.slice(0, 3).map((appt) => {
                const job = Array.isArray(appt.jobs) ? appt.jobs[0] ?? null : appt.jobs;
                const jobTitle = job?.title || "No job linked";
                const customer = Array.isArray(job?.customers) ? job?.customers[0] : job?.customers;

                return (
                  <div key={appt.id} className="rounded border border-slate-800 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{appt.title || "Appointment"}</span>
                      <span className="hb-muted text-xs">{formatTime(appt.start_time)}</span>
                    </div>
                    <p className="hb-muted text-xs">{jobTitle}</p>
                    <p className="hb-muted text-[11px]">
                      {customer?.name ? `Customer: ${customer.name}` : "Customer: Unknown"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="hb-card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3>Automations</h3>
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
      </div>
    </div>
  );
}

type AttentionCardItem = {
  id: string;
  primary: string;
  secondary?: string | null;
  tag?: string | null;
  href: string;
};

function AttentionCard({
  title,
  count,
  items,
  href,
  empty,
}: {
  title: string;
  count: number;
  items: AttentionCardItem[];
  href: string;
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-slate-500">{title}</p>
          <p className="text-xl font-semibold">{count}</p>
        </div>
        <Link href={href} className="hb-button-ghost text-xs">
          View
        </Link>
      </div>
      {!items.length ? (
        <p className="hb-muted text-xs">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded border border-slate-800 px-2 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Link href={item.href} className="font-semibold underline-offset-2 hover:underline">
                  {item.primary}
                </Link>
                {item.tag ? (
                  <span className="text-[11px] uppercase text-amber-300">{item.tag}</span>
                ) : null}
              </div>
              {item.secondary && <p className="hb-muted text-xs">{item.secondary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
