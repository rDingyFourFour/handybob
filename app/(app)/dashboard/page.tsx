// Build diagnostics only; remove after the investigation completes.
// if (process.env.FORCE_FAIL_DASHBOARD === "1") {
//   throw new Error("FORCE_FAIL_DASHBOARD: test crash from dashboard page module");
// }
// Authenticated dashboard page; expects a signed-in user and loads workspace context via createServerClient + getCurrentWorkspace.
import { buildLog } from "@/utils/debug/buildLog";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient } from "@//utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { getJobsSummaryForWorkspace } from "@/lib/domain/jobs";
import { formatCurrency } from "@/utils/timeline/formatters";
import { DEFAULT_TIMEZONE } from "@/utils/dashboard/time";
import { ACTIVE_APPOINTMENT_STATUSES, isTodayAppointment } from "@/lib/domain/appointments/dateUtils";
import {
  calculateDaysSinceDate,
  computeFollowupDueInfo,
  deriveInvoiceFollowupRecommendation,
  getInvoiceFollowupBaseDate,
  getInvoiceSentDate,
  isActionableFollowupDue,
  isDashboardFollowupDueToday,
} from "@/lib/domain/communications/followupRecommendations";
import { collectCallFollowupMessageIds, computeFollowupMessageCounts } from "@/lib/domain/communications/followupMessages";
import { loadFollowupQueueData } from "@/lib/domain/communications/followupQueue";
import { ActivitySkeleton } from "@/components/dashboard/ActivitySkeleton";
import { LeadsAttentionList } from "@/components/dashboard/LeadsAttentionList";
import { QuotesAttentionList } from "@/components/dashboard/QuotesAttentionList";
import { InvoicesAttentionList } from "@/components/dashboard/InvoicesAttentionList";
import { CallsAttentionList } from "@/components/dashboard/CallsAttentionList";
import { RecentActivityWidget } from "@/components/dashboard/RecentActivityWidget";
import { getAttentionItems, getAttentionCutoffs } from "@/lib/domain/attention";
import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

export const dynamic = "force-dynamic";

buildLog("app/(app)/dashboard/page module loaded");

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

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "canceled" | "no_show";

type DashboardAppointmentRow = {
  id: string;
  title: string | null;
  start_time: string | null;
  status: AppointmentStatus | null;
  job?: {
    id: string | null;
    title: string | null;
    customers?: { id: string | null; name: string | null } | { id: string | null; name: string | null }[] | null;
  } | null;
};

type FollowupMessageRow = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  channel: string | null;
  via: string | null;
  direction: string | null;
  created_at: string | null;
  sent_at: string | null;
};

type InvoiceFollowupRow = {
  id: string;
  status: string | null;
  due_at: string | null;
  issued_at: string | null;
  created_at: string | null;
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
    href: "/settings",
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
    href: "/settings",
  },
];


export default async function DashboardPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[dashboard] Failed to init Supabase client:", error);
    return (
      <HbCard>
        <h1>Dashboard unavailable</h1>
        <p className="hb-muted text-sm">Could not connect to Supabase. Check environment keys.</p>
      </HbCard>
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
      <HbCard>
        <h1>Dashboard unavailable</h1>
        <p className="hb-muted text-sm">Unable to resolve workspace. Please sign in again.</p>
      </HbCard>
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
      <HbCard>
        <h1>Dashboard unavailable</h1>
        <p className="hb-muted text-sm">Unable to resolve workspace. Please sign in again.</p>
      </HbCard>
    );
  }

  const workspaceTimeZone =
    (workspace as { timezone?: string | null }).timezone ?? DEFAULT_TIMEZONE;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowStartIso = tomorrowStart.toISOString();

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
    workspaceJobsCountRes,
    appointmentsTodayRes,
    followupMessagesRes,
    invoiceFollowupsRes;

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
      appointmentsTodayRes,
      followupMessagesRes,
      invoiceFollowupsRes,
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
        .not("status", "eq", "paid"),

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
      supabase
        .from("appointments")
        .select(
          `
            id,
            title,
            start_time,
            status,
            job:jobs (
              id,
              title,
              customers ( id, name )
            )
          `,
          { count: "exact" }
        )
        .eq("workspace_id", workspace.id)
        .in("status", ACTIVE_APPOINTMENT_STATUSES)
        .gte("start_time", todayStartIso)
        .lt("start_time", tomorrowStartIso)
        .order("start_time", { ascending: true })
        .limit(5),
      supabase
        .from("calls")
        .select(
          `
            id,
            job_id,
            quote_id,
            status,
            body,
            transcript,
            ai_summary,
            created_at
          `
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("messages")
        .select(
          `
            id,
            direction,
            channel,
            via,
            subject,
            body,
            status,
            customer_id,
            job_id,
            quote_id,
            invoice_id,
            created_at,
            sent_at
          `
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("invoices")
        .select("id, status, due_at, issued_at, created_at")
        .eq("workspace_id", workspace.id)
        .in("status", ["sent", "overdue"])
        .order("due_at", { ascending: false })
        .limit(200),
      getJobsSummaryForWorkspace({ supabase, workspaceId: workspace.id }),
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

  const allDashboardAppointments =
    (appointmentsTodayRes.data ?? []) as DashboardAppointmentRow[];
  console.log("[dashboard-appointments-source]", {
    total: allDashboardAppointments.length,
    sample: allDashboardAppointments.slice(0, 5).map((appointment) => ({
      id: appointment.id,
      start_time: appointment.start_time,
    })),
  });
  const todayTimezone = workspaceTimeZone ?? DEFAULT_TIMEZONE;
  const todayNow = new Date();
  const todayAppointments = allDashboardAppointments.filter((appointment) =>
    isTodayAppointment(appointment.start_time, todayNow, todayTimezone, appointment.status ?? undefined)
  );
  const todayAppointmentsCount = todayAppointments.length;
  console.log("[dashboard-appointments-today]", {
    sourceTotal: allDashboardAppointments.length,
    todayCount: todayAppointmentsCount,
    todayIds: todayAppointments.map((appointment) => appointment.id),
  });
  const followupMessageRows = (followupMessagesRes.data ?? []) as FollowupMessageRow[];
  const followupMessageRefs = followupMessageRows.map((message) => ({
    id: message.id,
    job_id: message.job_id ?? null,
    quote_id: message.quote_id ?? null,
    invoice_id: message.invoice_id ?? null,
    channel: message.channel ?? null,
    via: message.via ?? null,
    created_at: message.created_at,
  }));

  const { callDescriptors, queueCalls: dashboardQueueCalls } = await loadFollowupQueueData({
    supabase,
    workspaceId: workspace.id,
    limit: 200,
  });

  const queueDueTodayCalls = dashboardQueueCalls.filter((call) =>
    isDashboardFollowupDueToday(call.followupDueInfo, call.hasMatchingFollowupToday),
  );
  const actionableCallsCount = dashboardQueueCalls.length;
  const actionableCallIds = dashboardQueueCalls.slice(0, 5).map((call) => call.id);
  const callsDueTodayCount = queueDueTodayCalls.length;
  const callsDueTodayIds = queueDueTodayCalls.slice(0, 5).map((call) => call.id);

  const { messageIds: callFollowupMessageIds } = collectCallFollowupMessageIds({
    calls: callDescriptors,
    messages: followupMessageRefs,
  });

  const messageRows = followupMessageRows.map((message) => ({
    ...message,
    isCallFollowup: callFollowupMessageIds.has(message.id),
  }));
  const callFollowupMessages = messageRows.filter((message) => message.isCallFollowup);
  const { todayCount: followupMessagesTodayCount, weekCount: followupMessagesThisWeekCount } =
    computeFollowupMessageCounts(callFollowupMessages, todayNow);

  const invoiceFollowupRows = (invoiceFollowupsRes.data ?? []) as InvoiceFollowupRow[];
  const actionableInvoiceIds: string[] = [];
  invoiceFollowupRows.forEach((invoice) => {
    const followupBaseDate = getInvoiceFollowupBaseDate({
      dueAt: invoice.due_at,
      issuedAt: invoice.issued_at,
      createdAt: invoice.created_at,
    });
    const sentDate = getInvoiceSentDate({
      issuedAt: invoice.issued_at,
      createdAt: invoice.created_at,
    });
    const daysSinceInvoiceSent = calculateDaysSinceDate(sentDate);
    const followupRecommendation = deriveInvoiceFollowupRecommendation({
      outcome: null,
      daysSinceInvoiceSent,
      status: invoice.status,
    });
    if (followupRecommendation.shouldSkipFollowup) {
      return;
    }
    const followupDueInfo = computeFollowupDueInfo({
      quoteCreatedAt: followupBaseDate,
      callCreatedAt: null,
      invoiceDueAt: followupBaseDate,
      recommendedDelayDays: followupRecommendation.recommendedDelayDays ?? null,
      now: todayNow,
    });
    if (isActionableFollowupDue(followupDueInfo.dueStatus)) {
      actionableInvoiceIds.push(invoice.id);
    }
  });
  const actionableInvoiceCount = actionableInvoiceIds.length;

  console.log("[dashboard-followups]", {
    actionableCallsCount,
    callsDueTodayCount,
    actionableInvoiceCount,
    followupMessagesTodayCount,
    followupMessagesThisWeekCount,
    actionableCallIds,
    callsDueTodayIds,
    actionableInvoiceIds: actionableInvoiceIds.slice(0, 5),
    followupMessageIds: messageRows
      .filter((message) => message.isCallFollowup)
      .slice(0, 5)
      .map((message) => message.id),
  });


  const automationPrefsRow = (automationPrefsRes as { data: AutomationPreferencesRow | null }).data;

  const unpaidInvoicesCount = unpaidInvoicesRes.data?.length ?? 0;
  const dashboardUnpaidInvoiceIds = (unpaidInvoicesRes.data ?? []).map((invoice) => invoice.id);
  console.log("[dashboard-invoices-debug]", {
    workspaceId: workspace.id,
    sourceTotal: dashboardUnpaidInvoiceIds.length,
    unpaidCount: unpaidInvoicesCount,
    unpaidIds: dashboardUnpaidInvoiceIds.slice(0, 5),
  });
  const followupCallsHref = "/calls?followups=queue";
  const followupMessagesHref = "/messages?filterMode=followups";
  const followupInvoicesHref = "/invoices?status=unpaid";
  console.log("[dashboard-followups-nav]", {
    followupCallsHref,
    followupMessagesHref,
    followupInvoicesHref,
  });

  const appointmentsPriorityHref = "/appointments";
  const callsFollowupQueueCount = actionableCallsCount;
  const prioritiesNav = {
    appointmentsHref: appointmentsPriorityHref,
    followupCallsHref,
    followupMessagesHref,
    followupInvoicesHref,
  };
  console.log("[dashboard-priorities]", {
    workspaceId: workspace.id,
    todayAppointmentsCount,
    callsFollowupQueueCount,
    messagesFollowupsTodayCount: followupMessagesTodayCount,
    messagesFollowupsThisWeekCount: followupMessagesThisWeekCount,
    unpaidInvoicesCount,
  });
  console.log("[dashboard-priorities-nav]", prioritiesNav);
  console.log("[dashboard-followups-consistency]", {
    workspaceId: workspace.id,
    actionableCallsCount,
    callsFollowupQueueCount,
    followupsTileCount: actionableCallsCount,
  });

  const priorityItems = [
    {
      label: "Appointments today",
      count: todayAppointmentsCount,
      description:
        todayAppointmentsCount === 0
          ? "No visits scheduled for today."
          : `You have ${todayAppointmentsCount.toLocaleString()} visits scheduled for today.`,
      href: appointmentsPriorityHref,
      ctaLabel: "Open appointments",
    },
    {
      label: "Calls needing follow-up",
      count: callsFollowupQueueCount,
      description:
        callsFollowupQueueCount === 0
          ? "No follow-up calls waiting right now."
          : `You have ${callsFollowupQueueCount.toLocaleString()} calls ready for a follow-up.`,
      href: followupCallsHref,
      ctaLabel: "Review follow-up calls",
    },
    {
      label: "Follow-up messages this week",
      count: followupMessagesThisWeekCount,
      description:
        followupMessagesThisWeekCount === 0
          ? "No follow-up messages recorded yet this week."
          : `You’ve sent ${followupMessagesThisWeekCount.toLocaleString()} follow-ups this week. Check the message queue.`,
      href: followupMessagesHref,
      ctaLabel: "Open Messages",
    },
    {
      label: "Unpaid invoices",
      count: unpaidInvoicesCount,
      description:
        unpaidInvoicesCount === 0
          ? "No unpaid invoices to chase right now."
          : `You have ${unpaidInvoicesCount.toLocaleString()} unpaid invoices that may need a nudge.`,
      href: followupInvoicesHref,
      ctaLabel: "View invoices",
    },
  ];
  console.log("[dashboard-priorities-consistency]", {
    workspaceId: workspace.id,
    todayAppointmentsCount,
    callsFollowupQueueCount,
    unpaidInvoicesCount,
    messagesFollowupsTodayCount: followupMessagesTodayCount,
    messagesFollowupsThisWeekCount: followupMessagesThisWeekCount,
  });

  const followupsAreClear =
    actionableCallsCount === 0 &&
    actionableInvoiceCount === 0 &&
    followupMessagesTodayCount === 0;

  const prefs: AutomationPrefs = {
    notifyUrgentLeads: automationPrefsRow?.notify_urgent_leads ?? true,
    showOverdueWork: automationPrefsRow?.show_overdue_work ?? true,
  };

  const defaultAttentionItems = {
    leads: [],
    invoices: [],
    quotes: [],
    calls: [],
    urgentEmergencyCount: 0,
    leadSourceCounts: { web: 0, calls: 0, manual: 0, other: 0 },
  };

  let attentionItems = defaultAttentionItems;
  try {
    attentionItems = await getAttentionItems(workspace.id, {
      workspaceTimeZone,
    });
  } catch (error) {
    console.error("[dashboard] Failed to load attention items:", error);
    attentionItems = defaultAttentionItems;
  }
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
        <HbCard className="space-y-6">
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
        </HbCard>
      </div>
    );
  }

  const attentionCount =
    (leadsRes.data?.length ?? 0) +
    callsNeedingReview.length +
    (prefs.showOverdueWork ? overdueInvoices.length + staleQuotes.length : 0);

  const urgentEmergencyCount = attentionItems.urgentEmergencyCount;
  const leadSourceCounts = {
    web: attentionItems.leadSourceCounts?.web ?? 0,
    calls: attentionItems.leadSourceCounts?.calls ?? 0,
    manual: attentionItems.leadSourceCounts?.manual ?? 0,
    other: attentionItems.leadSourceCounts?.other ?? 0,
  };

  return (
    <div className="hb-shell pt-20 pb-8 space-y-8">
      <div className="space-y-6 relative">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="hb-heading-1 text-3xl font-semibold">{workspace.name ?? "Workspace"}</h1>
            <p className="hb-muted text-sm">
              Use this page to see what needs attention today: follow-ups, visits, and open invoices.
            </p>
          </div>
          <HbButton as={Link} href="/jobs/new" size="sm" variant="secondary">
            New job
          </HbButton>
        </header>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="hb-heading-2">Today’s priorities</h2>
            <p className="hb-muted text-sm">Command center</p>
          </div>
          <HbCard className="space-y-5">
            {priorityItems.map((item) => (
              <DashboardPriorityRow
                key={item.label}
                label={item.label}
                count={item.count}
                description={item.description}
                href={item.href}
                ctaLabel={item.ctaLabel}
              />
            ))}
          </HbCard>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="hb-heading-2">Today’s appointments</h2>
            <p className="hb-muted text-sm">
              Quick view of today’s visits. Go to Appointments for filters and history.
            </p>
          </div>
          <HbCard className="space-y-3">
            {todayAppointments.length === 0 ? (
              <p className="hb-muted text-sm">
                No visits scheduled for today. Use “Schedule visit” from a job to add one.
              </p>
            ) : (
              todayAppointments.map((appointment) => {
                const job = Array.isArray(appointment.job) ? appointment.job[0] ?? null : appointment.job ?? null;
                const customer = Array.isArray(job?.customers)
                  ? job?.customers[0] ?? null
                  : job?.customers ?? null;
                const customerName = customer?.name ?? "Unknown customer";
                const jobTitle = job?.title ?? "No job linked";
                const timezone = workspaceTimeZone ?? DEFAULT_TIMEZONE;

                return (
                  <div
                    key={appointment.id}
                    className="grid gap-3 text-sm text-slate-200 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      {formatAppointmentTimeLabel(appointment.start_time, timezone)}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-semibold text-slate-100">{customerName}</p>
                      {job?.id ? (
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-xs text-slate-400 transition hover:text-slate-100"
                        >
                          {jobTitle}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-500">{jobTitle}</span>
                      )}
                    </div>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${appointmentStatusClass(appointment.status)}`}>
                      {appointmentStatusLabel(appointment.status)}
                    </span>
                  </div>
                );
              })
            )}
          </HbCard>
          <div className="flex justify-end">
            <Link
              href="/appointments"
              className="text-xs uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-100"
            >
              View all appointments
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <div className="hb-card space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="hb-card-heading">Follow-ups</h3>
                <p className="hb-muted text-sm">
                  Quick view of calls, messages, and invoices that still need follow-up.
                </p>
              </div>
              {followupsAreClear && (
                <span className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                  No follow-ups due right now. Nice work.
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <FollowupStatChip
                label="Calls needing follow-up"
                count={actionableCallsCount}
                helper="Actionable calls from today’s followup queue."
                href={followupCallsHref}
                disabled={actionableCallsCount === 0}
              />
              <FollowupStatChip
                label="Invoices needing follow-up"
                count={actionableInvoiceCount}
                helper="Overdue or unpaid invoices with follow-ups due."
                href={followupInvoicesHref}
                disabled={actionableInvoiceCount === 0}
              />
              <FollowupStatChip
                label="Follow-up messages today"
                count={followupMessagesTodayCount}
                helper="Outbound follow-ups linked to calls."
                href={followupMessagesHref}
                disabled={followupMessagesTodayCount === 0}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="hb-heading-2">This Week</h2>
            <p className="hb-muted">Pipeline, billing, and automation highlights.</p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <HbCard className="space-y-1">
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
            </HbCard>
            <HbCard>
              <h3 className="hb-card-heading">Pending quotes</h3>
              <p className="text-2xl font-semibold">{pendingQuotesRes.data?.length ?? 0}</p>
            </HbCard>
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

          <div className="grid gap-5 md:grid-cols-2">
            <HbCard className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="hb-card-heading">Customers</h3>
                  <p className="text-2xl font-semibold">{workspaceCustomersCount}</p>
                </div>
                <Link href="/customers" className="hb-button-ghost text-xs">
                  View customers
                </Link>
              </div>
              <p className="hb-muted text-sm">People you’ve worked with or are following up with.</p>
            </HbCard>
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
            {urgentEmergencyCount > 0 ? (
              <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-200 flex items-center justify-between">
                <span>
                  You have {urgentEmergencyCount} urgent lead{urgentEmergencyCount === 1 ? "" : "s"} (AI urgency: emergency).
                </span>
                <Link href="/jobs?status=lead&ai_urgency=emergency" className="hb-button-ghost text-xs">
                  View urgent leads
                </Link>
              </div>
            ) : (
              <div className="rounded border border-slate-800/60 bg-slate-900/80 px-3 py-2 text-sm text-slate-400 flex items-center justify-between">
                <span>No urgent leads right now.</span>
                <Link href="/jobs?status=lead&ai_urgency=emergency" className="hb-button-ghost text-xs">
                  View urgent leads
                </Link>
              </div>
            )}
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

type DashboardPriorityRowProps = {
  label: string;
  count: number;
  description: string;
  href: string;
  ctaLabel: string;
};

function DashboardPriorityRow({
  label,
  count,
  description,
  href,
  ctaLabel,
}: DashboardPriorityRowProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-100">{count.toLocaleString()}</p>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      <HbButton as={Link} href={href} size="sm" variant="ghost" className="self-start">
        {ctaLabel}
      </HbButton>
    </div>
  );
}

function formatAppointmentTimeLabel(value: string | null, timezone: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function appointmentStatusLabel(status: AppointmentStatus | null) {
  if (!status || status === "scheduled") {
    return "Scheduled";
  }
  if (status === "completed") {
    return "Completed";
  }
  if (status === "no_show") {
    return "No-show";
  }
  if (status === "cancelled" || status === "canceled") {
    return "Canceled";
  }
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function appointmentStatusClass(status: AppointmentStatus | null) {
  if (status === "completed") {
    return "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "cancelled" || status === "canceled" || status === "no_show") {
    return "border border-rose-500/40 bg-rose-500/10 text-rose-200";
  }
  return "border border-amber-500/40 bg-amber-500/10 text-amber-200";
}

type FollowupStatChipProps = {
  label: string;
  count: number;
  helper: string;
  href: string;
  disabled?: boolean;
};

function FollowupStatChip({ label, count, helper, href, disabled }: FollowupStatChipProps) {
  return (
    <Link
      href={href}
      className={`group min-w-[12rem] flex-1 rounded-2xl border px-4 py-3 text-sm transition ${
        disabled
          ? "border-slate-800/60 bg-slate-900/40 text-slate-500 pointer-events-none"
          : "border-slate-700 bg-slate-950/60 text-slate-100 hover:border-slate-500"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</p>
        <p className="text-2xl font-semibold">{count.toLocaleString()}</p>
      </div>
      <p className="mt-2 text-xs text-slate-400">{helper}</p>
    </Link>
  );
}
