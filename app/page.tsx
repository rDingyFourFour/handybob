// app/page.tsx
import Link from "next/link";
import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";
import { newLeadCutoff, overdueInvoiceCutoff, staleQuoteCutoff } from "@/utils/attention/attentionModel";
import { formatCurrency } from "@/utils/timeline/formatters";

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

type AppointmentRow = {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  jobs:
    | { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null }
  | { title: string | null; customers?: { name: string | null } | { name: string | null }[] | null }[]
  | null;
};

type AppointmentActivityRow = {
  id: string;
  job_id: string | null;
  title: string | null;
  start_time: string | null;
};

type CallActivityRow = {
  id: string;
  job_id: string | null;
  created_at: string | null;
  status: string | null;
};

type MessageActivityRow = {
  id: string;
  job_id: string | null;
  created_at: string | null;
  subject: string | null;
  direction: string | null;
};

type QuoteActivityRow = {
  id: string;
  job_id: string | null;
  created_at: string | null;
  total: number | null;
  status: string | null;
};

type InvoiceActivityRow = {
  id: string;
  job_id: string | null;
  created_at: string | null;
  total: number | null;
  status: string | null;
};

type ActivityEvent = {
  id: string;
  type: "call" | "message" | "quote" | "invoice" | "appointment";
  timestamp: string | null;
  description: string;
  jobId?: string | null;
  customerId?: string | null;
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

  revalidatePath("/");
}

export async function retryDashboardData() {
  "use server";
  revalidatePath("/");
}

export async function markAppointmentCompleted(formData: FormData) {
  "use server";
  const supabase = await createServerClient();
  const appointmentId = formData.get("appointmentId");
  if (!appointmentId) return;

  await supabase
    .from("appointments")
    .update({ status: "completed" })
    .eq("id", String(appointmentId));

  revalidatePath("/");
}

export async function dismissAttentionItem(formData: FormData) {
  "use server";
  const supabase = await createServerClient();
  const itemType = String(formData.get("itemType") || "");
  const itemId = formData.get("itemId");
  if (!itemId) return;

  const tableMap: Record<string, { table: string; updates: Record<string, string> }> = {
    lead: { table: "jobs", updates: { status: "archived" } },
    quote: { table: "quotes", updates: { status: "archived" } },
    invoice: { table: "invoices", updates: { status: "archived" } },
    call: { table: "calls", updates: { status: "archived" } },
  };
  const entry = tableMap[itemType];
  if (!entry) return;

  await supabase
    .from(entry.table)
    .update(entry.updates)
    .eq("id", String(itemId));

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

function daysSince(date: string | null) {
  if (!date) return null;
  const now = Date.now();
  const then = new Date(date).getTime();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

function normalizeCustomer(
  customer:
    | { id: string | null; name: string | null }
    | { id: string | null; name: string | null }[]
    | null
    | undefined
) {
  if (!customer) return null;
  return Array.isArray(customer) ? customer[0] ?? null : customer;
}

function buildMessageSnippet(text: string | null, fallback: string | null = null) {
  const value = (text || fallback || "").trim();
  if (!value) return "";
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

const LEAD_SOURCE_LABELS: Record<string, string> = {
  web_form: "Web form",
  voicemail: "Call",
  manual: "Manual",
};

function formatLeadSourceLabel(source?: string | null) {
  if (!source) return "Other";
  const key = source.toLowerCase();
  return LEAD_SOURCE_LABELS[key] ?? "Other";
}

function formatRelativeMinutesAgo(date: string | null) {
  if (!date) return "";
  const diffMinutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (diffMinutes <= 0) return "Received just now";
  if (diffMinutes < 60) {
    return `Received ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }
  const hours = Math.floor(diffMinutes / 60);
  return `Received ${hours} hour${hours === 1 ? "" : "s"} ago`;
}

const ACTIVITY_ICON_PATHS: Record<ActivityEvent["type"], JSX.Element> = {
  call: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 5.18 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.72 12.12 12.12 0 0 0 .7 2.81 2 2 0 0 1-.45 2L9.13 11a16 16 0 0 0 6.77 6.77l1.48-1.48a2 2 0 0 1 2-.45 12.12 12.12 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  message: (
    <path d="M3 11.5a8.5 8.5 0 0 1 8.5-8.5h6a8.5 8.5 0 0 1 8.5 8.5 8.5 8.5 0 0 1-8.5 8.5H13l-4 4V19.5A8.5 8.5 0 0 1 3 11.5z" />
  ),
  quote: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16l4-4h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
      <path d="M14 2v6h6M10 14h4M10 18h6" />
    </>
  ),
  invoice: (
    <>
      <path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8l-4 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M16 3v4M4 9h16" />
    </>
  ),
  appointment: (
    <>
      <path d="M3 8h18M7 2v6M17 2v6M5 22h14a2 2 0 0 0 2-2V10H3v10a2 2 0 0 0 2 2z" />
    </>
  ),
};

function ActivityIcon({ type }: { type: ActivityEvent["type"] }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-slate-200">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ACTIVITY_ICON_PATHS[type]}
      </svg>
    </span>
  );
}

const DEFAULT_TIMEZONE =
  process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  "UTC";

function getDateKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTimeRange(startDate: Date, endDate: Date | null, timezone: string) {
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const startLabel = timeFormatter.format(startDate);
  if (!endDate) return startLabel;
  const sameDay = getDateKey(startDate, timezone) === getDateKey(endDate, timezone);
  const endLabel = timeFormatter.format(endDate);
  return sameDay ? `${startLabel}–${endLabel}` : startLabel;
}

function formatFriendlyDateTime(
  start: string | null,
  end: string | null,
  timezone: string = DEFAULT_TIMEZONE
) {
  if (!start) return "";
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const rangeLabel = formatTimeRange(startDate, endDate, timezone);
  const startKey = getDateKey(startDate, timezone);
  const now = new Date();
  const todayKey = getDateKey(now, timezone);
  const tomorrowKey = getDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000), timezone);

  if (startKey === todayKey) {
    return `Today at ${rangeLabel}`;
  }
  if (startKey === tomorrowKey) {
    return `Tomorrow at ${rangeLabel}`;
  }

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(startDate);
  return `${weekday} · ${rangeLabel}`;
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

const marketingHighlights = [
  "Keep quotes and invoices tidy so customers always understand what they're paying for.",
  "Schedule calls, visits, and jobs without bouncing between calendars.",
  "Let the AI assistant summarize conversations and flag what needs attention next.",
];

const howItWorksSteps = [
  {
    title: "Capture leads",
    body: "Record calls, web form submissions, or jot them down manually so work never slips through the cracks.",
  },
  {
    title: "Turn into quotes & invoices",
    body: "Use the AI assistant to scope work and send polished quotes, then convert accepted ones into invoices.",
  },
  {
    title: "Stay on top of jobs & appointments",
    body: "Track work, calendar slots, and inbox items from the job dashboard so nothing falls behind.",
  },
];

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

const guestHero = (
  <div className="flex-1 flex flex-col items-center justify-center gap-10 px-4 py-12 text-center">
    <div className="w-full max-w-4xl space-y-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-10 shadow-2xl shadow-slate-900/40">
      <p className="text-xs uppercase tracking-[0.4em] text-slate-500">HandyBob</p>
      <h1 className="text-4xl font-semibold text-slate-50">HandyBob</h1>
      <p className="text-lg text-slate-400">
        Full support office in an app for independent handypeople.
      </p>
      <ul className="space-y-3 text-left text-lg text-slate-200">
        {marketingHighlights.map((highlight) => (
          <li className="flex items-start gap-3" key={highlight}>
            <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/signup" className="hb-button text-sm">
          Create account
        </Link>
        <Link href="/login" className="hb-button-ghost text-sm">
          Sign in
        </Link>
      </div>
      <Link
        href="/appointments/new"
        className="hb-button fixed bottom-6 right-6 z-20 px-4 py-3 text-sm shadow-xl shadow-slate-900"
      >
        New appointment
      </Link>
    </div>
    <div className="w-full max-w-4xl">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-left text-sm text-slate-300">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">How HandyBob works</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {howItWorksSteps.map((step) => (
            <div key={step.title} className="space-y-1 rounded-xl border border-slate-800/70 bg-slate-950/20 p-4">
              <p className="text-sm font-semibold text-slate-100">{step.title}</p>
              <p className="text-xs text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default async function HomePage() {
  let supabase;
  try {
    supabase = await createServerClient();
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
  } catch (error) {
    console.error("[home] Failed to resolve workspace:", error);
    return (
      <div className="hb-card">
        <h1>Dashboard unavailable</h1>
        <p className="hb-muted text-sm">Unable to resolve workspace. Please sign in again.</p>
      </div>
    );
  }

  if (!user) {
    return guestHero;
  }

  try {
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

  const workspaceTimeZone =
    (workspace as { timezone?: string | null }).timezone ?? DEFAULT_TIMEZONE;

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
  let appointmentActivityRes,
    callActivityRes,
    messageActivityRes,
    quoteActivityRes,
    invoiceActivityRes;
  let workspaceCustomersCountRes,
    workspaceJobsCountRes;

  try {
    [
      appointmentsRes,
      leadsRes,
      pendingQuotesRes,
      unpaidInvoicesRes,
      paidQuotesThisMonthRes,
      paidInvoicesThisMonthRes,
      inboundMessagesRes,
      appointmentActivityRes,
      callActivityRes,
      messageActivityRes,
      quoteActivityRes,
      invoiceActivityRes,
      urgentLeadsRes,
      callsNeedingReviewRes,
      overdueInvoicesRes,
      staleQuotesRes,
      automationPrefsRes,
      workspaceCustomersCountRes,
      workspaceJobsCountRes,
    ] = await Promise.all([
        supabase
          .from("appointments")
          .select(
            `
            id,
            title,
            end_time,
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
        .from("appointments")
        .select("id, job_id, title, start_time")
        .eq("workspace_id", workspace.id)
        .order("start_time", { ascending: false })
        .limit(5),

      supabase
        .from("calls")
        .select("id, job_id, created_at, status")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("messages")
        .select("id, job_id, customer_id, created_at, subject, direction")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("quotes")
        .select("id, job_id, created_at, total, status")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("invoices")
        .select("id, job_id, created_at, total, status")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("appointments")
        .select("id, job_id, title, start_time")
        .eq("workspace_id", workspace.id)
        .order("start_time", { ascending: false })
        .limit(5),

      supabase
        .from("calls")
        .select("id, job_id, created_at, status")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("messages")
        .select("id, job_id, created_at, subject, direction")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("quotes")
        .select("id, job_id, created_at, total, status")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("invoices")
        .select("id, job_id, created_at, total, status")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(5),

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

  const inboundMessages = (inboundMessagesRes.data ?? []) as MessageThreadRow[];
  const inboundThreadsMap = new Map<string, MessageThreadRow>();
  for (const msg of inboundMessages) {
    const key = msg.customer_id ?? msg.job_id ?? msg.id;
    if (!key || inboundThreadsMap.has(key)) continue;
    inboundThreadsMap.set(key, msg);
  }
  const unrespondedMessages = Array.from(inboundThreadsMap.values());
  const messageThreadsToShow = unrespondedMessages.slice(0, 3);
  const inboundMessagesCount = unrespondedMessages.length;

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

  const appointmentActivities = (appointmentActivityRes.data ?? []) as AppointmentActivityRow[];
  const callActivities = (callActivityRes.data ?? []) as CallActivityRow[];
  const messageActivities = (messageActivityRes.data ?? []) as MessageActivityRow[];
  const quoteActivities = (quoteActivityRes.data ?? []) as QuoteActivityRow[];
  const invoiceActivities = (invoiceActivityRes.data ?? []) as InvoiceActivityRow[];

  const activityEvents: ActivityEvent[] = [
    ...appointmentActivities.map((row) => ({
      id: row.id,
      type: "appointment" as const,
      timestamp: row.start_time,
      description: row.title ? `Appointment: ${row.title}` : "Appointment scheduled",
      jobId: row.job_id,
      customerId: null,
    })),
    ...callActivities.map((row) => ({
      id: row.id,
      type: "call" as const,
      timestamp: row.created_at,
      description: `Call ${row.status ?? ""}`.trim() || "Call logged",
      jobId: row.job_id,
      customerId: null,
    })),
    ...messageActivities.map((row) => ({
      id: row.id,
      type: "message" as const,
      timestamp: row.created_at,
      description: row.subject ? `Message: ${row.subject}` : "New message",
      jobId: row.job_id,
      customerId: row.customer_id,
    })),
    ...quoteActivities.map((row) => ({
      id: row.id,
      type: "quote" as const,
      timestamp: row.created_at,
      description: `Quote ${row.status ?? ""}`.trim() || "Quote sent",
      jobId: row.job_id,
    })),
    ...invoiceActivities.map((row) => ({
      id: row.id,
      type: "invoice" as const,
      timestamp: row.created_at,
      description: `Invoice ${row.status ?? ""}`.trim() || "Invoice created",
      jobId: row.job_id,
    })),
  ]
    .filter((event) => event.timestamp)
    .sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 5);

  const getActivityLink = (event: ActivityEvent) => {
    if (event.type === "call") {
      return `/calls/${event.id}`;
    }
    if (event.type === "message") {
      return event.customerId ? `/inbox?customer_id=${event.customerId}` : "/inbox";
    }
    return event.jobId ? `/jobs/${event.jobId}?tab=timeline` : "/jobs?tab=timeline";
  };

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
          <p className="hb-muted">Today's work at a glance.</p>
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
                <h3 className="hb-card-heading text-2xl font-bold tracking-tight">Today's appointments</h3>
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
              <div className="space-y-0 divide-y divide-slate-800/60">
                {todaysAppointments.slice(0, 3).map((appt) => {
                  const job = Array.isArray(appt.jobs) ? appt.jobs[0] ?? null : appt.jobs;
                  const jobTitle = job?.title || "No job linked";
                  const customer = normalizeCustomer(job?.customers);
                  const customerLabel = customer?.name || "Unknown customer";
                  const appointmentLabel = formatFriendlyDateTime(
                    appt.start_time,
                    appt.end_time,
                    workspaceTimeZone
                  );

                  return (
                    <div key={appt.id} className="rounded border border-slate-800 px-3 py-2 text-sm">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-semibold text-slate-200">
                            {appt.title || "Appointment"}
                          </span>
                          <span className="text-sm font-semibold text-slate-400">
                            {appointmentLabel || "-"}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300">
                          {customerLabel} • {jobTitle}
                        </p>
                      </div>
                      <form action={markAppointmentCompleted} className="pt-2">
                        <input type="hidden" name="appointmentId" value={appt.id} />
                        <button type="submit" className="text-[11px] text-slate-400 hover:text-slate-200">
                          Mark completed
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
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

            {messageThreadsToShow.length === 0 ? (
              <p className="hb-muted text-sm">No inbound messages waiting right now.</p>
            ) : (
              <div className="space-y-0 divide-y divide-slate-800/60">
                {messageThreadsToShow.map((msg) => {
                  const customer = normalizeCustomer(msg.customers);
                  const customerName = customer?.name || "Unknown contact";
                  const job = Array.isArray(msg.job) ? msg.job[0] ?? null : msg.job ?? null;
                  const jobTitle = job?.title || "No job linked";
                  const timestamp = msg.sent_at || msg.created_at;
                  const timestampLabel = formatFriendlyDateTime(timestamp, null, workspaceTimeZone);
                  const snippet = buildMessageSnippet(msg.body, msg.subject);
                  const inboxLink = msg.customer_id ? `/inbox?customer_id=${msg.customer_id}` : "/inbox";

                  const receivedLabel = formatRelativeMinutesAgo(timestamp);

                  return (
                    <div key={msg.id} className="rounded border border-slate-800 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={inboxLink} className="font-semibold underline-offset-2 hover:underline">
                          {customerName}
                        </Link>
                          <span className="text-[11px] text-slate-500">
                            {timestampLabel || "Just now"}
                          </span>
                      </div>
                      {snippet && <p className="text-sm text-slate-200">{snippet}</p>}
                      {receivedLabel && <p className="text-[11px] text-slate-500">{receivedLabel}</p>}
                      <p className="hb-muted text-[11px]">{jobTitle}</p>
                    </div>
                  );
                })}
              </div>
            )}
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

      {activityEvents.length > 0 && (
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
            <div className="space-y-2">
                {activityEvents.map((event) => {
                  const eventHref = getActivityLink(event);
                  const eventTime =
                    formatFriendlyDateTime(event.timestamp, null, workspaceTimeZone) || "—";
                  return (
                    <Link
                      key={`${event.type}-${event.id}`}
                      href={eventHref}
                      className="flex items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2 text-sm hover:border-slate-600"
                    >
                              <div className="flex items-center gap-3">
                                <ActivityIcon type={event.type} />
                                <div>
                                  <p className="font-semibold text-slate-100">{event.description}</p>
                                  <p className="text-[11px] text-slate-500">{eventTime}</p>
                                </div>
                              </div>
                      <span className="text-[11px] uppercase text-slate-500">Timeline</span>
                    </Link>
                  );
                })}
            </div>
          </div>
        </section>
      )}

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
            <AttentionCard
              title="New leads (7 days)"
              count={leadsRes.data?.length ?? 0}
              href="/jobs"
              items={topLeads.map((lead) => {
                const leadCustomer = normalizeCustomer(lead.customer);
                const leadName = leadCustomer?.name || "Unknown customer";
                const sourceLabel = formatLeadSourceLabel(lead.source);
                const leadAge = daysSince(lead.created_at);
                return {
                  id: lead.id,
                  primary: lead.title || "Lead",
                  secondary: `Caller: ${leadName} • ${sourceLabel}`,
                  meta: `Lead opened ${leadAge ?? "—"} day${leadAge === 1 ? "" : "s"} ago`,
                  tag: lead.ai_urgency || lead.urgency || "lead",
                  actions: [
                    { label: "Follow up", href: `/jobs/${lead.id}`, variant: "ghost" },
                  ],
                  dismissType: "lead",
                  href: `/jobs/${lead.id}`,
                };
              })}
              empty="No new leads."
            />
            <AttentionCard
              title="Overdue invoices"
              count={overdueInvoices.length}
              href="/invoices"
              items={topInvoices.map((inv) => {
                const job = inv.job;
                const customers = normalizeCustomer(job?.customers);
                const jobTitle = job?.title || "invoice";
                const invoiceRecipient = customers?.name || jobTitle;
                const overdueDays = daysSince(inv.due_at);
                return {
                  id: inv.id,
                  primary: jobTitle,
                  amount: formatCurrency(inv.total ?? 0),
                  meta: `${overdueDays ?? 0} day${overdueDays === 1 ? "" : "s"} overdue`,
                  secondary: `Invoice to ${invoiceRecipient}`,
                  tag: inv.status || "overdue",
                  actions: [
                    { label: "Open invoice", href: `/invoices/${inv.id}`, variant: "ghost" },
                    { label: "Mark paid", href: `/invoices/${inv.id}?action=mark-paid`, variant: "solid" },
                  ],
                  dismissType: "invoice",
                  href: `/invoices/${inv.id}`,
                };
              })}
              empty="No overdue invoices."
              badge="Overdue"
              badgeClassName="border border-red-500/30 bg-red-500/10 text-red-200"
            />
            <AttentionCard
              title="Quotes to follow up"
              count={staleQuotes.length}
              href="/quotes"
              items={topQuotes.map((quote) => {
                const job = quote.job;
                const customers = normalizeCustomer(job?.customers);
                const jobTitle = job?.title || "job";
                const quoteRecipient = customers?.name || jobTitle;
                const quoteAge = daysSince(quote.created_at);
                return {
                  id: quote.id,
                  primary: jobTitle,
                  amount: formatCurrency(quote.total ?? 0),
                  meta: `Sent ${quoteAge ?? "—"} day${quoteAge === 1 ? "" : "s"} ago`,
                  secondary: `Quote for ${quoteRecipient}`,
                  tag: quote.status || "sent",
                  actions: [
                    { label: "Send reminder", href: `/quotes/${quote.id}`, variant: "ghost" },
                    { label: "Follow up", href: `/quotes/${quote.id}?action=follow-up`, variant: "ghost" },
                  ],
                  dismissType: "quote",
                  href: `/quotes/${quote.id}`,
                };
              })}
              empty="No quotes waiting."
            />
            <AttentionCard
              title="Incomplete tasks"
              count={callsNeedingReview.length}
              href="/calls?filter=needs_processing"
              items={topCalls.map((call) => {
                const friendly = formatFriendlyDateTime(call.created_at, null, workspaceTimeZone);
                const relative = formatRelativeMinutesAgo(call.created_at);
                return {
                  id: call.id,
                  primary: call.from_number || "Unknown number",
                  secondary: friendly,
                  meta: relative,
                  tag: call.ai_urgency || call.priority || "follow-up",
                  actions: [
                    { label: "Review call", href: `/calls/${call.id}`, variant: "ghost" },
                    { label: "Transcribe call", href: `/calls/${call.id}?action=transcribe`, variant: "ghost" },
                  ],
                  dismissType: "call",
                  href: `/calls/${call.id}`,
                };
              })}
              empty="All calls processed."
              badge="Unprocessed"
              badgeClassName="border border-amber-500/30 bg-amber-500/10 text-amber-200"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

type AttentionCardItem = {
  id: string;
  primary: string;
  secondary?: string | null;
  tag?: string | null;
  amount?: string;
  meta?: string;
  actions?: { label: string; href: string; variant?: "ghost" | "solid" }[];
  dismissType?: "lead" | "quote" | "invoice" | "call";
  href: string;
};

function AttentionCard({
  title,
  count,
  items,
  href,
  empty,
  badge,
  badgeClassName,
}: {
  title: string;
  count: number;
  items: AttentionCardItem[];
  href: string;
  empty: string;
  badge?: string;
  badgeClassName?: string;
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
      {!items.length ? (
        <p className="hb-muted text-xs">{empty}</p>
      ) : (
        <div className="space-y-0 divide-y divide-slate-800/70">
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
              {item.amount && <p className="text-sm text-slate-200">Amount: {item.amount}</p>}
              {item.meta && <p className="text-xs text-slate-400">{item.meta}</p>}
              {item.secondary && <p className="hb-muted text-xs">{item.secondary}</p>}
              {item.actions?.length ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {item.actions.map((action) => (
                    <Link
                      key={`${action.label}-${action.href}`}
                      href={action.href}
                      className={`text-[11px] ${
                        action.variant === "solid"
                          ? "hb-button px-2 py-1"
                          : "hb-button-ghost px-2 py-1"
                      }`}
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              ) : null}
              {item.dismissType && (
                <form action={dismissAttentionItem} className="pt-2">
                  <input type="hidden" name="itemType" value={item.dismissType} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <button type="submit" className="text-[11px] text-slate-400 hover:text-slate-200 underline">
                    Dismiss
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
