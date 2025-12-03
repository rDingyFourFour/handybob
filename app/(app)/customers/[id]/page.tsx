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

type TimelineEventType = "job" | "call" | "message";

type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  timestamp: string | null;
  description: string;
  href: string;
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

  const displayName = customer.name ?? "Unnamed customer";
  const contactLine = [customer.email, customer.phone].filter(Boolean).join(" · ");
  const createdLabel = formatDate(customer.created_at);
  const sinceLabel = formatShortDate(customer.created_at);

  const timelineEvents: TimelineEvent[] = [];
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

    if (jobsData.error || callsData.error || messagesData.error) {
      console.error("[customer-detail] Activity fetch failed", {
        jobsError: jobsData.error,
        callsError: callsData.error,
        messagesError: messagesData.error,
      });
    } else {
      (jobsData.data ?? []).forEach((job) => {
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
      (callsData.data ?? []).forEach((call) => {
        timelineEvents.push({
          id: `call-${call.id}`,
          type: "call",
          timestamp: call.created_at,
          description: `Call ${call.status ?? "logged"}`,
          href: `/calls/${call.id}`,
        });
      });
      (messagesData.data ?? []).forEach((message) => {
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

  const sortedEvents = timelineEvents
    .filter((event) => event.timestamp)
    .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
    .slice(0, 6);
  const timelineEmpty = sortedEvents.length === 0;
  const phoneAgentHref = `/calls/new?customerId=${customer.id}`;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer details</p>
            <h1 className="hb-heading-1 text-3xl font-semibold">{displayName}</h1>
            {contactLine && <p className="text-sm text-slate-400">{contactLine}</p>}
            {createdLabel && (
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Created {createdLabel}
              </p>
            )}
            {sinceLabel && (
              <p className="text-xs text-slate-400">Customer since {sinceLabel}</p>
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
