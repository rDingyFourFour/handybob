// Build diagnostics only; remove after the investigation completes.
// if (process.env.FORCE_FAIL_DASHBOARD === "1") {
//   throw new Error("FORCE_FAIL_DASHBOARD: test crash from dashboard page module");
// }
// Authenticated dashboard page; expects a signed-in user and loads workspace context via createServerClient + getCurrentWorkspace.
import { buildLog } from "@/utils/debug/buildLog";
import Link from "next/link";
import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient } from "@//utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { getJobsSummaryForWorkspace } from "@/lib/domain/jobs";
import { DEFAULT_TIMEZONE } from "@/utils/dashboard/time";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  isTodayAppointment,
  normalizeAppointmentStatus,
} from "@/lib/domain/appointments/dateUtils";
import {
  calculateDaysSinceDate,
  computeFollowupDueInfo,
  deriveFollowupRecommendation,
  deriveInvoiceFollowupRecommendation,
  getInvoiceFollowupBaseDate,
  getInvoiceSentDate,
  isActionableFollowupDue,
} from "@/lib/domain/communications/followupRecommendations";
import {
  CallFollowupDescriptor,
  FollowupMessageRef,
  collectCallFollowupMessageIds,
  computeFollowupMessageCounts,
  createFollowupMessageTimestampBounds,
  findMatchingFollowupMessage,
  parseFollowupMessageTimestamp,
} from "@/lib/domain/communications/followupMessages";
import {
  loadFollowupQueueData,
} from "@/lib/domain/communications/followupQueue";
import { ActivitySkeleton } from "@/components/dashboard/ActivitySkeleton";
import { RecentActivityWidget } from "@/components/dashboard/RecentActivityWidget";
import { getAttentionCutoffs } from "@/lib/domain/attention";
import {
  AttentionAppointmentRow,
  AttentionCallRow,
  AttentionInvoiceRow,
  AttentionJobRow,
  AttentionMessageRow,
  buildAttentionSummary,
  buildAttentionCounts,
  hasAnyAttention as hasAnyAttentionHelper,
  isInvoiceOverdueForAttention,
  isInvoiceAgingUnpaidForAttention,
} from "@/lib/domain/dashboard/attention";
import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

export const dynamic = "force-dynamic";

buildLog("app/(app)/dashboard/page module loaded");

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
  end_time: string | null;
  status: AppointmentStatus | null;
  job?: {
    id: string | null;
    title: string | null;
    customers?: { id: string | null; name: string | null } | { id: string | null; name: string | null }[] | null;
  } | null;
};

type FollowupCallRow = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  status: string | null;
  body: string | null;
  transcript: string | null;
  ai_summary: string | null;
  created_at: string | null;
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

type DashboardUnpaidInvoiceRow = {
  id: string;
  status: string | null;
  due_at: string | null;
  due_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type InvoiceFollowupRow = {
  id: string;
  status: string | null;
  due_at: string | null;
  due_date?: string | null;
  issued_at: string | null;
  created_at: string | null;
  updated_at?: string | null;
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
    overdueInvoiceCutoff: invoiceOverdueThreshold,
  } = await getAttentionCutoffs(todayStart);
  // Attention cards pull:
  // - Calls needing review: calls missing transcript/summary/job_id or flagged needs_followup.
  // - Overdue invoices / stale quotes: status filters plus date thresholds above.
  // Automation prefs control visibility of overdue work blocks.

  let unpaidInvoicesRes,
    paidQuotesThisMonthRes,
    paidInvoicesThisMonthRes,
    inboundMessagesRes,
    overdueInvoicesRes;
  let workspaceCustomersCountRes,
    workspaceJobsCountRes,
    quotedJobsRes,
    appointmentsTodayRes,
    followupCallsRes,
    followupMessagesRes,
    invoiceFollowupsRes,
    jobsSummaryRes;

  try {
    [
      unpaidInvoicesRes,
      paidQuotesThisMonthRes,
      paidInvoicesThisMonthRes,
      inboundMessagesRes,
      overdueInvoicesRes,
      workspaceCustomersCountRes,
      workspaceJobsCountRes,
      quotedJobsRes,
      appointmentsTodayRes,
      followupCallsRes,
      followupMessagesRes,
      invoiceFollowupsRes,
      jobsSummaryRes,
    ] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, status, due_at, due_date, created_at, updated_at")
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
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id),
      supabase
        .from("jobs")
        .select("id, status, created_at, updated_at")
        .eq("workspace_id", workspace.id)
        .eq("status", "quoted")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("appointments")
        .select(
          `
            id,
            title,
            start_time,
            end_time,
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
  const unpaidInvoiceRows = (unpaidInvoicesRes.data ?? []) as DashboardUnpaidInvoiceRow[];

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
  const weekAnchor = new Date(todayNow);
  weekAnchor.setHours(0, 0, 0, 0);
  const weekDayIndex = weekAnchor.getDay();
  const weekStart = new Date(weekAnchor);
  weekStart.setDate(weekAnchor.getDate() - weekDayIndex);
  const weeklyDateKeys = new Set<string>();
  for (let offset = 0; offset < 7; offset++) {
    const candidate = new Date(weekStart);
    candidate.setDate(weekStart.getDate() + offset);
    weeklyDateKeys.add(formatDateKey(candidate, todayTimezone));
  }
  const appointmentsThisWeekCount = allDashboardAppointments.reduce((count, appointment) => {
    const status = normalizeAppointmentStatus(appointment.status);
    if (!status || !ACTIVE_APPOINTMENT_STATUSES.includes(status)) {
      return count;
    }
    const parsed = appointment.start_time ? new Date(appointment.start_time) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return count;
    }
    return weeklyDateKeys.has(formatDateKey(parsed, todayTimezone)) ? count + 1 : count;
  }, 0);
  console.log("[dashboard-appointments-today]", {
    sourceTotal: allDashboardAppointments.length,
    todayCount: todayAppointmentsCount,
    todayIds: todayAppointments.map((appointment) => appointment.id),
  });
  const followupCallRows = (followupCallsRes.data ?? []) as FollowupCallRow[];
  const followupQueueData = await loadFollowupQueueData({
    supabase,
    workspaceId: workspace.id,
    limit: 200,
  });
  const queueCount = followupQueueData?.queueCount ?? 0;
  const queueIdsRaw = followupQueueData?.queueIds;
  const queueIds = Array.isArray(queueIdsRaw) ? queueIdsRaw : [];
  const jobIds = Array.from(
    new Set(followupCallRows.map((call) => call.job_id).filter((jobId): jobId is string => Boolean(jobId)))
  );
  const quoteCandidatesByJob: Record<string, { id: string; created_at: string | null }> = {};
  if (jobIds.length > 0) {
    const quoteLimit = Math.max(30, jobIds.length * 3);
    const { data: quoteRows } = await supabase
      .from("quotes")
      .select("id, job_id, created_at")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(quoteLimit);
    (quoteRows ?? []).forEach((quote) => {
      if (!quote.job_id) return;
      if (!quoteCandidatesByJob[quote.job_id]) {
        quoteCandidatesByJob[quote.job_id] = { id: quote.id, created_at: quote.created_at ?? null };
      }
    });
  }

  const followupMessageRows = (followupMessagesRes.data ?? []) as FollowupMessageRow[];
  const followupMessageRefs: FollowupMessageRef[] = followupMessageRows.map((message) => ({
    id: message.id,
    job_id: message.job_id ?? null,
    quote_id: message.quote_id ?? null,
    invoice_id: message.invoice_id ?? null,
    channel: message.channel ?? null,
    via: message.via ?? null,
    created_at: message.created_at,
  }));
  const followupMessageBounds = createFollowupMessageTimestampBounds(todayNow);
  const todayFollowupMessageRefs = followupMessageRefs.filter((message) => {
    const parsed = parseFollowupMessageTimestamp(message);
    if (!parsed) {
      return false;
    }
    const timestamp = parsed.getTime();
    return (
      timestamp >= followupMessageBounds.todayStart.getTime() &&
      timestamp < followupMessageBounds.tomorrowStart.getTime()
    );
  });
  const callDescriptors: CallFollowupDescriptor[] = followupCallRows.map((call) => {
    const quoteCandidate =
      call.job_id && quoteCandidatesByJob[call.job_id] ? quoteCandidatesByJob[call.job_id] : null;
    const quoteId = quoteCandidate?.id ?? null;
    const quoteCreatedAt = quoteCandidate?.created_at ?? null;
    const quoteDate = quoteCreatedAt ? new Date(quoteCreatedAt) : null;
    const daysSinceQuote =
      quoteDate && !Number.isNaN(quoteDate.getTime())
        ? Math.floor((todayNow.getTime() - quoteDate.getTime()) / ONE_DAY_MS)
        : null;
    const outcome = call.body?.trim() || call.status?.trim() || null;
    return {
      id: call.id,
      job_id: call.job_id,
      quote_id: quoteId,
      created_at: call.created_at,
      outcome,
      daysSinceQuote,
      modelChannelSuggestion: null,
    };
  });

  const { messageIds: callFollowupMessageIds } = collectCallFollowupMessageIds({
    calls: callDescriptors,
    messages: followupMessageRefs,
  });

  const callsWithFollowups = followupCallRows.map((call) => {
    const quoteCandidate =
      call.job_id && quoteCandidatesByJob[call.job_id] ? quoteCandidatesByJob[call.job_id] : null;
    const quoteCreatedAt = quoteCandidate?.created_at ?? null;
    const quoteDate = quoteCreatedAt ? new Date(quoteCreatedAt) : null;
    const daysSinceQuote =
      quoteDate && !Number.isNaN(quoteDate.getTime())
        ? Math.floor((todayNow.getTime() - quoteDate.getTime()) / ONE_DAY_MS)
        : null;
    const outcome = call.body?.trim() || call.status?.trim() || null;
    const followupRecommendation =
      outcome &&
      deriveFollowupRecommendation({
        outcome,
        daysSinceQuote,
        modelChannelSuggestion: null,
      });
    const recommendedChannel = followupRecommendation?.recommendedChannel ?? null;
    const matchingFollowupMessage =
      followupRecommendation &&
      findMatchingFollowupMessage({
        messages: todayFollowupMessageRefs,
        recommendedChannel,
        jobId: call.job_id ?? null,
        quoteId: quoteCandidate?.id ?? call.quote_id ?? null,
      });
    const hasMatchingFollowupToday = Boolean(matchingFollowupMessage);
    const followupDueInfo = computeFollowupDueInfo({
      quoteCreatedAt,
      callCreatedAt: call.created_at,
      invoiceDueAt: null,
      recommendedDelayDays: followupRecommendation?.recommendedDelayDays ?? null,
      now: todayNow,
    });
    return {
      ...call,
      followupRecommendation,
      followupDueInfo,
      hasMatchingFollowupToday,
    };
  });

  const actionableCallFollowups = callsWithFollowups.filter((call) => {
    const recommendation = call.followupRecommendation;
    return (
      recommendation &&
      !recommendation.shouldSkipFollowup &&
      isActionableFollowupDue(call.followupDueInfo.dueStatus) &&
      !call.hasMatchingFollowupToday
    );
  });
  const actionableCallsCount = actionableCallFollowups.length;
  const actionableCallIds = actionableCallFollowups.slice(0, 5).map((call) => call.id);
  const messageRows = followupMessageRows.map((message) => ({
    ...message,
    isCallFollowup: callFollowupMessageIds.has(message.id),
  }));
  const { todayCount: followupMessagesTodayCount, weekCount: followupMessagesThisWeekCount } =
    computeFollowupMessageCounts(
      messageRows.filter((message) => message.isCallFollowup),
      todayNow
    );

  const invoiceFollowupRows = (invoiceFollowupsRes.data ?? []) as InvoiceFollowupRow[];
  const invoiceStatusesToInclude = new Set(["sent", "overdue", "queued"]);
  const invoicesSentThisWeekCount = invoiceFollowupRows.reduce((count, invoice) => {
    const normalizedStatus = invoice.status?.toLowerCase();
    if (!normalizedStatus || !invoiceStatusesToInclude.has(normalizedStatus)) {
      return count;
    }
    const sentDateValue = getInvoiceSentDate({
      issuedAt: invoice.issued_at,
      createdAt: invoice.created_at,
    });
    if (!sentDateValue) {
      return count;
    }
    const parsedSentDate = new Date(sentDateValue);
    if (Number.isNaN(parsedSentDate.getTime())) {
      return count;
    }
    return weeklyDateKeys.has(formatDateKey(parsedSentDate, todayTimezone)) ? count + 1 : count;
  }, 0);
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
    actionableInvoiceCount,
    followupMessagesTodayCount,
    followupMessagesThisWeekCount,
    actionableCallIds,
    actionableInvoiceIds: actionableInvoiceIds.slice(0, 5),
    followupMessageIds: messageRows
      .filter((message) => message.isCallFollowup)
      .slice(0, 5)
      .map((message) => message.id),
  });

  const jobsSummary = jobsSummaryRes ?? { open: 0, scheduled: 0, completedLast30Days: 0 };
  console.log("[dashboard-week-summary]", {
    workspaceId: workspace.id,
    appointmentsThisWeekCount,
    invoicesSentThisWeekCount,
    followupMessagesThisWeekCount,
    paidQuotesCount,
    collectedThisMonth,
    inboundMessagesCount,
    paidInvoicesCount,
    collectedInvoicesThisMonth,
  });

  console.log("[dashboard-jobs-summary]", {
    workspaceId: workspace.id,
    jobsSummary,
  });

  const unpaidInvoicesCount = unpaidInvoiceRows.length;
  const followupCallsHref = "/calls?followups=queue";
  const followupMessagesHref = "/messages?filterMode=followups";
  const followupInvoicesHref = "/invoices?status=unpaid";
  console.log("[dashboard-followups-nav]", {
    followupCallsHref,
    followupMessagesHref,
    followupInvoicesHref,
  });

  const appointmentsPriorityHref = "/appointments";
  const callsFollowupQueueCount = queueCount;
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
  console.log("[dashboard-priorities-consistency]", {
    workspaceId: workspace.id,
    callsFollowupQueueCount,
    followupQueueCountFromLoader: queueCount,
    followupQueueIds: queueIds.slice(0, 5),
  });

  const priorityItems = [
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

  const sampleIds = (
    rows: Array<{ id?: string | null } | null | undefined>,
    limit = 5
  ) =>
    rows
      .map((row) => row?.id)
      .filter((id): id is string => Boolean(id))
      .slice(0, limit);

  const quotedJobs = (quotedJobsRes.data ?? []) as {
    id: string;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
  }[];
  const attentionJobRows: AttentionJobRow[] = quotedJobs.map((job) => ({
    id: job.id,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
  }));
  const attentionInvoiceRows: AttentionInvoiceRow[] = unpaidInvoiceRows.map((invoice) => {
    const dueValue = invoice.due_at ?? invoice.due_date ?? null;
    return {
      id: invoice.id,
      status: invoice.status,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
      due_date: dueValue,
      due_at: dueValue,
    };
  });
  const attentionAppointmentRows: AttentionAppointmentRow[] = allDashboardAppointments.map(
    (appointment) => ({
      id: appointment.id,
      status: appointment.status,
      start_time: appointment.start_time,
      end_time: appointment.end_time,
    })
  );
  const attentionCallRows: AttentionCallRow[] = followupCallRows.map((call) => ({
    id: call.id,
    created_at: call.created_at,
    outcome: call.outcome ?? null,
  }));
  const attentionMessageRows: AttentionMessageRow[] = followupMessageRows.map((message) => ({
    id: message.id,
    created_at: message.created_at,
  }));
  const attentionSummary = buildAttentionSummary({
    jobs: attentionJobRows,
    invoices: attentionInvoiceRows,
    appointments: attentionAppointmentRows,
    calls: attentionCallRows,
    messages: attentionMessageRows,
    today: todayNow,
  });
  const firstAttentionInvoice = attentionInvoiceRows[0];
  const firstInvoiceDebug = firstAttentionInvoice
    ? {
        id: firstAttentionInvoice.id,
        status: firstAttentionInvoice.status,
        due_date: firstAttentionInvoice.due_date ?? firstAttentionInvoice.due_at ?? null,
        isOverdue: isInvoiceOverdueForAttention(firstAttentionInvoice, todayNow),
        isAgingUnpaid: isInvoiceAgingUnpaidForAttention(firstAttentionInvoice, todayNow),
      }
    : null;
  console.log("[dashboard-attention-invoices-debug]", {
    workspaceId: workspace.id,
    attentionInvoiceRowsCount: attentionInvoiceRows.length,
    overdueInvoicesCount: attentionSummary.overdueInvoicesCount,
    agingUnpaidInvoicesCount: attentionSummary.agingUnpaidInvoicesCount,
    invoiceSample: attentionInvoiceRows.slice(0, 5).map((row) => ({
      id: row.id,
      status: row.status,
      due_date: row.due_date ?? row.due_at ?? null,
    })),
    firstInvoiceDebug,
  });
  const attentionCounts = buildAttentionCounts(attentionSummary);
  const messagesNeedingAttentionCount = attentionSummary.messagesNeedingAttentionCount;
  const totalAttentionCount = attentionCounts.totalAttentionCount + messagesNeedingAttentionCount;
  const hasAnyAttentionItems = hasAnyAttentionHelper(attentionSummary, {
    messagesNeedingAttentionCount,
  });
  const overdueInvoiceIdsSample = attentionSummary.overdueInvoiceIdsSample;
  console.log("[dashboard-attention-source]", {
    workspaceId: workspace.id,
    quotedJobsCount: quotedJobs.length,
    quotedJobIdsSample: sampleIds(quotedJobs),
    overdueInvoicesSourceCount: attentionInvoiceRows.length,
    overdueInvoiceIdsSample,
    appointmentsSourceCount: allDashboardAppointments.length,
    appointmentIdsSample: sampleIds(allDashboardAppointments),
    followupCallSourceCount: followupCallRows.length,
    followupCallIdsSample: sampleIds(followupCallRows),
    followupMessageSourceCount: followupMessageRows.length,
    followupMessageIdsSample: sampleIds(followupMessageRows),
  });
  console.log("[dashboard-attention-rows]", {
    workspaceId: workspace.id,
    attentionJobRowsCount: attentionJobRows.length,
    jobIdsSample: sampleIds(attentionJobRows),
    attentionInvoiceRowsCount: attentionInvoiceRows.length,
    invoiceIdsSample: sampleIds(attentionInvoiceRows),
    attentionAppointmentRowsCount: attentionAppointmentRows.length,
    appointmentIdsSample: sampleIds(attentionAppointmentRows),
    attentionCallRowsCount: attentionCallRows.length,
    callIdsSample: sampleIds(attentionCallRows),
    attentionMessageRowsCount: attentionMessageRows.length,
    messageIdsSample: sampleIds(attentionMessageRows),
  });
  console.log("[dashboard-attention-summary]", {
    workspaceId: workspace.id,
    ...attentionCounts,
    ...attentionSummary,
  });
  const overdueInvoicesCount = attentionCounts.overdueInvoicesCount;
  const jobsNeedingAttentionCount = attentionCounts.jobsNeedingAttentionCount;
  const appointmentsNeedingAttentionCount = attentionCounts.appointmentsNeedingAttentionCount;
  const callsNeedingAttentionCount = attentionCounts.callsNeedingAttentionCount;
  const agingUnpaidInvoicesCount = attentionCounts.agingUnpaidInvoicesCount;
  console.log("[dashboard-attention-counts]", {
    workspaceId: workspace.id,
    overdueInvoicesCount,
    jobsNeedingAttentionCount,
    appointmentsNeedingAttentionCount,
    callsNeedingAttentionCount,
    messagesNeedingAttentionCount,
    agingUnpaidInvoicesCount,
    totalAttentionCount,
  });
  const overdueInvoicesHref = "/invoices?status=unpaid&overdue=1";
  const agingUnpaidInvoicesHref = "/invoices?status=unpaid&aging=1";

  const attentionRows = [
    {
      key: "overdueInvoices",
      count: attentionSummary.overdueInvoicesCount,
      label: `Overdue invoices (${attentionSummary.overdueInvoicesCount.toLocaleString()})`,
      description: "Invoices past their due date.",
      href: overdueInvoicesHref,
    },
    {
      key: "stalledJobs",
      count: attentionSummary.stalledJobsCount,
      label: `Stalled quotes (${attentionSummary.stalledJobsCount.toLocaleString()})`,
      description: "Quoted jobs with no movement for more than a week.",
      href: "/jobs?status=quoted",
    },
    {
      key: "missedAppointments",
      count: attentionSummary.missedAppointmentsCount,
      label: `Missed appointments (${attentionSummary.missedAppointmentsCount.toLocaleString()})`,
      description: "Visits that were scheduled in the past but never marked complete.",
      href: "/appointments?history=attention",
    },
    {
      key: "callsMissingOutcome",
      count: attentionSummary.callsMissingOutcomeCount,
      label: `Calls missing outcome (${attentionSummary.callsMissingOutcomeCount.toLocaleString()})`,
      description: "Calls that still need an outcome logged.",
      href: "/calls?needsOutcome=true",
    },
    {
      key: "agingUnpaidInvoices",
      count: attentionSummary.agingUnpaidInvoicesCount,
      label: `Aging unpaid invoices (${attentionSummary.agingUnpaidInvoicesCount.toLocaleString()})`,
      description: "Unpaid invoices older than two weeks.",
      href: agingUnpaidInvoicesHref,
    },
  ];
  const attentionItems = attentionRows.filter((row) => row.count > 0);
  console.log("[dashboard-attention-links]", {
    workspaceId: workspace.id,
    overdueInvoicesHref,
    overdueInvoicesCount,
    overdueInvoiceIdsSample,
    agingUnpaidInvoicesHref,
    agingUnpaidInvoicesCount,
    agingUnpaidInvoiceIdsSample: attentionSummary.agingUnpaidInvoiceIdsSample,
  });
  console.log("[dashboard-attention-items]", {
    workspaceId: workspace.id,
    items: attentionItems.map((item) => ({
      key: item.key,
      count: item.count,
      href: item.href,
      label: item.label,
    })),
  });
  const invoiceLoadFailed =
    Boolean(overdueInvoicesRes.error) || Boolean(paidInvoicesThisMonthRes.error);
  const hasAnyAttention = hasAnyAttentionItems && !invoiceLoadFailed;
  console.log("[dashboard-attention-visibility]", {
    workspaceId: workspace.id,
    hasAnyAttention,
    totalAttentionCount,
    countsSnapshot: {
      overdueInvoicesCount: attentionSummary.overdueInvoicesCount,
      stalledJobsCount: attentionSummary.stalledJobsCount,
      missedAppointmentsCount: attentionSummary.missedAppointmentsCount,
      callsMissingOutcomeCount: attentionSummary.callsMissingOutcomeCount,
      agingUnpaidInvoicesCount: attentionSummary.agingUnpaidInvoicesCount,
      messagesNeedingAttentionCount,
    },
    itemsRenderedCount: attentionItems.length,
  });
  console.log("[dashboard-attention-header]", {
    workspaceId: workspace.id,
    hasAnyAttention,
    totalAttentionCount,
  });
  const attentionTooltipCopy =
    "Shows things that may be slipping: overdue invoices, stalled quotes, missed visits, calls without outcomes, and similar items that need attention.";

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
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="hb-heading-2">This week</h2>
                <p className="hb-muted text-sm">Weekly highlights</p>
              </div>
              <HbCard className="space-y-4">
                <Link href={appointmentsPriorityHref} className="group block">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800/80 px-3 py-3 transition hover:border-slate-600">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Appointments</p>
                      <p className="text-2xl font-semibold text-slate-100">{appointmentsThisWeekCount.toLocaleString()}</p>
                      <p className="text-sm text-slate-400">Visits scheduled for this calendar week.</p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-400">View</span>
                  </div>
                </Link>
                <Link href="/invoices" className="group block">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800/80 px-3 py-3 transition hover:border-slate-600">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoices sent</p>
                      <p className="text-2xl font-semibold text-slate-100">{invoicesSentThisWeekCount.toLocaleString()}</p>
                      <p className="text-sm text-slate-400">Invoices issued within this week.</p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-400">View</span>
                  </div>
                </Link>
                <Link href={followupMessagesHref} className="group block">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800/80 px-3 py-3 transition hover:border-slate-600">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Follow-up messages</p>
                      <p className="text-2xl font-semibold text-slate-100">{followupMessagesThisWeekCount.toLocaleString()}</p>
                      <p className="text-sm text-slate-400">Messages logged as follow-ups this week.</p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-400">View</span>
                  </div>
                </Link>
                {invoiceLoadFailed && (
                  <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    <p>Unable to load invoices right now.</p>
                    <form action={retryDashboardData} className="mt-2 flex justify-end">
                      <button type="submit" className="hb-button px-3 py-1 text-xs">
                        Retry
                      </button>
                    </form>
                  </div>
                )}
              </HbCard>
            </div>
            <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="hb-heading-2">Attention needed</h2>
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-[11px] font-semibold text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
                  title={attentionTooltipCopy}
                  aria-label={attentionTooltipCopy}
                >
                  i
                </span>
              </div>
              <p className="hb-muted text-sm">Issues trending toward urgency</p>
            </div>
              <HbCard className="space-y-3">
                {hasAnyAttention ? (
                  attentionItems.map((row) => (
                    <Link
                      key={row.key}
                      href={row.href}
                      className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-800/60 px-4 py-3 transition hover:border-slate-600"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{row.label}</p>
                        <p className="text-xs text-slate-400">{row.description}</p>
                      </div>
                      <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Open</span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">
                    🎉 Nothing needs special attention right now.
                  </p>
                )}
              </HbCard>
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

      </div>
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

function formatDateKey(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

const ONE_DAY_MS = 1000 * 60 * 60 * 24;
