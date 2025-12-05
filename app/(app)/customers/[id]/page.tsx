export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type CustomerRecord = {
  id: string;
  workspace_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CallRow = {
  id: string;
  status: string | null;
  created_at: string | null;
};

type MessageRow = {
  id: string;
  subject: string | null;
  channel: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimelineDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const RELATIONSHIP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_JOB_STATUSES = new Set(["completed", "closed", "cancelled", "canceled"]);

function isJobActive(status: string | null) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return !INACTIVE_JOB_STATUSES.has(normalized);
}

function formatRelativeContactLabel(date: Date) {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) {
    return "Today";
  }
  const diffDays = Math.floor(diffMs / ONE_DAY_MS);
  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "1 day ago";
  }
  return `${diffDays} days ago`;
}

type TimelineEventType = "job" | "call" | "message";
type ContactActivityType = "call" | "message";

type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  timestamp: string | null;
  description: string;
  href: string;
};

type ContactActivity = {
  type: ContactActivityType;
  timestamp: string;
};

function fallbackCard(title: string, body: string) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <HbButton as="a" href="/customers" size="sm">
          Back to customers
        </HbButton>
      </HbCard>
    </div>
  );
}

export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  if (!id || !id.trim() || id === "new") {
    redirect("/customers/new");
    return null;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[customer-detail] Failed to init Supabase client", error);
    return fallbackCard("Customer unavailable", "Could not connect to Supabase. Please try again.");
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
    console.error("[customer-detail] Failed to resolve workspace", error);
    return fallbackCard("Customer unavailable", "Unable to resolve workspace. Please try again.");
  }

  if (!workspace) {
    return fallbackCard("Customer unavailable", "Unable to resolve workspace. Please try again.");
  }

  let customer: CustomerRecord | null = null;

  try {
    const { data, error } = await supabase
      .from<CustomerRecord>("customers")
      .select("id, name, email, phone, created_at")
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[customer-detail] Customer lookup failed", error);
      return fallbackCard("Customer not found", "We couldn’t find that customer. It may have been deleted.");
    }

    customer = data ?? null;
  } catch (error) {
    console.error("[customer-detail] Customer query error", error);
    return fallbackCard("Customer not found", "We couldn’t find that customer. It may have been deleted.");
  }

  if (!customer) {
    return fallbackCard("Customer not found", "We couldn’t find that customer. It may have been deleted.");
  }

  const customerId = customer.id;
  const displayName = customer.name ?? "Unnamed customer";
  const contactLine = [customer.email, customer.phone].filter(Boolean).join(" · ");
  const createdLabel = formatDate(customer.created_at);
  const sinceLabel = formatShortDate(customer.created_at);
  const quickActions =
    customerId
      ? [
          { label: "New job", href: `/jobs/new?customerId=${customerId}` },
          { label: "Open phone agent", href: `/calls?customerId=${customerId}` },
          { label: "New appointment", href: `/appointments/new?customerId=${customerId}` },
          { label: "New invoice", href: `/invoices/new?customerId=${customerId}` },
        ]
      : [];

  const timelineEvents: TimelineEvent[] = [];
  let jobs: JobRow[] = [];
  let calls: CallRow[] = [];
  let messages: MessageRow[] = [];
  try {
    const [jobsData, callsData, messagesData] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, title, status, created_at, updated_at")
        .eq("workspace_id", workspace.id)
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("calls")
        .select("id, status, created_at")
        .eq("workspace_id", workspace.id)
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("messages")
        .select("id, subject, channel, created_at")
        .eq("workspace_id", workspace.id)
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    jobs = jobsData.data ?? [];
    calls = callsData.data ?? [];
    messages = messagesData.data ?? [];

    if (jobsData.error || callsData.error || messagesData.error) {
      console.error("[customer-detail] Activity fetch failed", {
        jobsError: jobsData.error,
        callsError: callsData.error,
        messagesError: messagesData.error,
      });
    } else {
      jobs.forEach((job) => {
        const statusLabel = job.status === "completed" ? "completed" : "created";
        const timestamp = job.status === "completed" ? job.updated_at ?? job.created_at : job.created_at;
        const title = job.title ? ` · ${job.title}` : "";
        timelineEvents.push({
          id: `job-${job.id}-${statusLabel}`,
          type: "job",
          timestamp,
          description: `Job ${statusLabel}${title}`,
          href: `/jobs/${job.id}`,
        });
      });
      calls.forEach((call) => {
        timelineEvents.push({
          id: `call-${call.id}`,
          type: "call",
          timestamp: call.created_at,
          description: `Call ${call.status ?? "logged"}`,
          href: `/calls/${call.id}`,
        });
      });
      messages.forEach((message) => {
        const subjectSegment = message.subject ? `: ${message.subject}` : "";
        timelineEvents.push({
          id: `message-${message.id}`,
          type: "message",
          timestamp: message.created_at,
          description: `Message${subjectSegment}`,
          href: `/messages/${message.id}`,
        });
      });
    }
  } catch (error) {
    console.error("[customer-detail] Activity query failed", error);
  }

  const totalJobs = jobs.length;
  const activeJobs = jobs.reduce((count, job) => (isJobActive(job.status) ? count + 1 : count), 0);
  const relationshipWindowStart = new Date().getTime() - RELATIONSHIP_WINDOW_MS;
  const recentCallsCount = calls.reduce((count, call) => {
    if (!call.created_at) {
      return count;
    }
    const parsed = new Date(call.created_at).getTime();
    if (Number.isNaN(parsed)) {
      return count;
    }
    return parsed >= relationshipWindowStart ? count + 1 : count;
  }, 0);
  const recentMessagesCount = messages.reduce((count, message) => {
    if (!message.created_at) {
      return count;
    }
    const parsed = new Date(message.created_at).getTime();
    if (Number.isNaN(parsed)) {
      return count;
    }
    return parsed >= relationshipWindowStart ? count + 1 : count;
  }, 0);
  const contactActivities: ContactActivity[] = [];
  calls.forEach((call) => {
    if (call.created_at) {
      contactActivities.push({ type: "call", timestamp: call.created_at });
    }
  });
  messages.forEach((message) => {
    if (message.created_at) {
      contactActivities.push({ type: "message", timestamp: message.created_at });
    }
  });
  const lastContactActivity = contactActivities.reduce<ContactActivity | null>((latest, activity) => {
    const activityTime = new Date(activity.timestamp).getTime();
    if (Number.isNaN(activityTime)) {
      return latest;
    }
    if (!latest) {
      return activity;
    }
    const latestTime = new Date(latest.timestamp).getTime();
    if (activityTime > latestTime) {
      return activity;
    }
    return latest;
  }, null);
  const lastContactDate = lastContactActivity ? new Date(lastContactActivity.timestamp) : null;
  const lastContactText =
    lastContactDate && !Number.isNaN(lastContactDate.getTime())
      ? `Last contacted: ${formatRelativeContactLabel(lastContactDate)} via ${
          lastContactActivity?.type === "call" ? "Call" : "Message"
        }`
      : "No contact recorded yet.";
  const callCount = calls.length;
  const messageCount = messages.length;

  const sortedEvents = timelineEvents
    .filter((event) => event.timestamp)
    .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
    .slice(0, 6);
  const timelineEmpty = sortedEvents.length === 0;
  const phoneAgentHref = `/calls/new?customerId=${customerId}`;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer details</p>
            <h1 className="hb-heading-1 text-3xl font-semibold">{displayName}</h1>
            {contactLine && <p className="text-sm text-slate-400">{contactLine}</p>}
            <p className="text-sm text-slate-400">{lastContactText}</p>
            {createdLabel && (
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Created {createdLabel}
              </p>
            )}
            {sinceLabel && (
              <p className="text-xs text-slate-400">Customer since {sinceLabel}</p>
            )}
            <p className="text-xs text-slate-400">
              Create a job to track work, schedule visits, and send quotes for this customer.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
              <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">At a glance</span>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-200">
                  Jobs: {totalJobs}
                </span>
                <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-200">
                  Calls: {callCount}
                </span>
                <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-200">
                  Messages: {messageCount}
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
              <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Relationship health</span>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-200">
                  {totalJobs} total jobs
                </span>
                {activeJobs > 0 && (
                  <span className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-200">
                    {activeJobs} active jobs
                  </span>
                )}
                {recentCallsCount > 0 && (
                  <span className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-200">
                    {recentCallsCount} recent calls
                  </span>
                )}
                {recentMessagesCount > 0 && (
                  <span className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-200">
                    {recentMessagesCount} recent messages
                  </span>
                )}
              </div>
            </div>
            {customerId && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-3 text-sm text-slate-200">
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  Start something for this customer
                </span>
                <div className="flex flex-wrap gap-2">
                  <HbButton
                    as={Link}
                    href={`/jobs/new?customerId=${customerId}`}
                    variant="secondary"
                    size="sm"
                    className="whitespace-nowrap"
                  >
                    New job
                  </HbButton>
                  <HbButton
                    as={Link}
                    href={`/appointments/new?customerId=${customerId}`}
                    variant="ghost"
                    size="sm"
                    className="whitespace-nowrap"
                  >
                    New appointment
                  </HbButton>
                  <HbButton
                    as={Link}
                    href={`/invoices/new?customerId=${customerId}`}
                    variant="ghost"
                    size="sm"
                    className="whitespace-nowrap"
                  >
                    New invoice
                  </HbButton>
                </div>
              </div>
            )}
            {quickActions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  Quick actions
                </span>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((action) => (
                  <HbButton
                    key={action.label}
                    as={Link}
                    href={action.href}
                    variant="ghost"
                    size="sm"
                    className="whitespace-nowrap"
                  >
                    {action.label}
                  </HbButton>
                ))}
                <HbButton
                  as={Link}
                  href={`/jobs/new?customerId=${customer.id}`}
                  variant="ghost"
                  size="sm"
                  className="whitespace-nowrap"
                >
                  Create job for this customer
                </HbButton>
              </div>
            </div>
          )}
          </div>
          <div className="flex gap-2">
            <HbButton as="a" href="/customers" variant="ghost" size="sm">
              Back to customers
            </HbButton>
            <HbButton as="a" href={`/jobs/new?customerId=${customer.id}`} variant="secondary" size="sm">
              New job
            </HbButton>
          </div>
        </header>
        <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-2">
          <div>
            <span className="font-semibold text-slate-100">Email:</span> {customer.email ?? "—"}
          </div>
          <div>
            <span className="font-semibold text-slate-100">Phone:</span> {customer.phone ?? "—"}
          </div>
          <div>
            <span className="font-semibold text-slate-100">Created:</span> {createdLabel ?? "—"}
          </div>
          <div>
            <span className="font-semibold text-slate-100">Workspace:</span> {workspace.name ?? "—"}
          </div>
        </div>
      </HbCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <HbCard className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="hb-card-heading text-lg font-semibold">Jobs for this customer</h2>
              <p className="text-sm text-slate-400">
                Track every estimate or repair and message thread under this profile.
              </p>
            </div>
            <Link href={`/jobs?customerId=${customer.id}`} className="hb-button-ghost text-xs">
              View jobs
            </Link>
          </div>
          <p className="text-sm text-slate-400">
            Jobs will appear here once you create them or link them to this customer.
          </p>
        </HbCard>

        <HbCard className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="hb-card-heading text-lg font-semibold">Calls &amp; messages</h2>
              <p className="text-sm text-slate-400">Quickly surface conversations with this person.</p>
            </div>
            <div className="flex flex-col gap-1">
              <Link href={`/calls?customerId=${customer.id}`} className="hb-button-ghost text-xs">
                Calls
              </Link>
              <Link href={`/messages?customerId=${customer.id}`} className="hb-button-ghost text-xs">
                Messages
              </Link>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            View the timeline filtered to this customer once those pages support it.
          </p>
        </HbCard>

        <HbCard className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="hb-card-heading text-lg font-semibold">Notes</h2>
            <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Read-only</span>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
            <p>No notes yet.</p>
            <p className="text-[11px] text-slate-500">
              Add notes later to keep updates, reminders, and preferences close at hand.
            </p>
          </div>
        </HbCard>
      </div>

      <HbCard className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Recent activity</p>
            <h2 className="hb-heading-2 text-xl font-semibold">What’s happening with this person</h2>
            <p className="text-sm text-slate-400">
              Jobs, calls, and messages all in one place so you can quickly understand their history.
            </p>
          </div>
          <HbButton as={Link} href={phoneAgentHref} variant="secondary" size="sm">
            Open phone agent
          </HbButton>
        </div>
        {timelineEmpty ? (
          <p className="text-sm text-slate-400">No activity recorded yet for this customer.</p>
        ) : (
          <div className="space-y-2">
            {sortedEvents.map((event) => (
              <Link
                key={event.id}
                href={event.href}
                className="group flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
              >
                <div>
                  <p className="font-semibold text-slate-100">{event.description}</p>
                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
                    {event.type}
                  </p>
                </div>
                <span className="text-xs text-slate-500">{formatTimelineDate(event.timestamp) ?? "—"}</span>
              </Link>
            ))}
          </div>
        )}
      </HbCard>
    </div>
  );
}
