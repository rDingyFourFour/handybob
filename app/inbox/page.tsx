import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

type RelatedCustomer = {
  id: string | null;
  name: string | null;
  email?: string | null;
  phone?: string | null;
};

type RelatedJob = {
  id: string | null;
  title: string | null;
  customers: RelatedCustomer | RelatedCustomer[] | null;
};

type MessageRow = {
  id: string;
  channel: string | null;
  direction: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  created_at: string | null;
  job_id: string | null;
  customer_id: string | null;
  jobs: RelatedJob | RelatedJob[] | null;
  customers: RelatedCustomer | RelatedCustomer[] | null;
};

type CallRow = {
  id: string;
  direction: string | null;
  status: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  job_id: string | null;
  customer_id: string | null;
  jobs: RelatedJob | RelatedJob[] | null;
  customers: RelatedCustomer | RelatedCustomer[] | null;
};

type InboxItem = {
  id: string;
  type: "message" | "call";
  channel: string;
  direction: string;
  status: string | null;
  timestamp: string | null;
  title: string;
  body: string | null;
  jobId: string | null;
  jobTitle: string | null;
  customerName: string | null;
};

function normalizeJob(job: RelatedJob | RelatedJob[] | null): RelatedJob | null {
  if (!job) return null;
  return Array.isArray(job) ? job[0] ?? null : job;
}

function normalizeCustomer(customer: RelatedCustomer | RelatedCustomer[] | null): RelatedCustomer | null {
  if (!customer) return null;
  return Array.isArray(customer) ? customer[0] ?? null : customer;
}

function formatTimestamp(ts: string | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function InboxPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [messagesRes, callsRes] = await Promise.all([
    supabase
      .from("messages")
      .select(
        `
          id,
          channel,
          direction,
          subject,
          body,
          status,
          created_at,
          job_id,
          customer_id,
          jobs ( id, title, customers ( id, name ) ),
          customers ( id, name, email, phone )
        `
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("calls")
      .select(
        `
          id,
          direction,
          status,
          started_at,
          duration_seconds,
          summary,
          job_id,
          customer_id,
          jobs ( id, title, customers ( id, name ) ),
          customers ( id, name, email, phone )
        `
      )
      .order("started_at", { ascending: false })
      .limit(50),
  ]);

  const messages = (messagesRes.data ?? []) as MessageRow[];
  const calls = (callsRes.data ?? []) as CallRow[];

  const items: InboxItem[] = [
    ...messages.map((message) => {
      const job = normalizeJob(message.jobs) || (message.job_id ? { id: message.job_id, title: null, customers: null } : null);
      const customer =
        normalizeCustomer(message.customers) ||
        normalizeCustomer(job?.customers ?? null);
      return {
        id: `msg-${message.id}`,
        type: "message" as const,
        channel: message.channel || "email",
        direction: message.direction || "outbound",
        status: message.status,
        timestamp: message.created_at,
        title: `${message.direction === "inbound" ? "Inbound" : "Outbound"} ${message.channel || "message"}`,
        body: message.body || message.subject,
        jobId: job?.id ?? null,
        jobTitle: job?.title ?? null,
        customerName: customer?.name ?? null,
      };
    }),
    ...calls.map((call) => {
      const job = normalizeJob(call.jobs) || (call.job_id ? { id: call.job_id, title: null, customers: null } : null);
      const customer =
        normalizeCustomer(call.customers) ||
        normalizeCustomer(job?.customers ?? null);
      return {
        id: `call-${call.id}`,
        type: "call" as const,
        channel: "call",
        direction: call.direction || "outbound",
        status: call.status,
        timestamp: call.started_at,
        title: `${call.direction === "inbound" ? "Inbound" : "Outbound"} call`,
        body: call.summary,
        jobId: job?.id ?? null,
        jobTitle: job?.title ?? null,
        customerName: customer?.name ?? null,
      };
    }),
  ].sort((a, b) => {
    const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return dateB - dateA;
  });

  return (
    <div className="space-y-6">
      <div className="hb-card space-y-1">
        <h1>Inbox</h1>
        <p className="hb-muted">
          All recent messages and calls in one view.
        </p>
      </div>

      <div className="hb-card space-y-4">
        {items.length === 0 ? (
          <p className="hb-muted text-sm">
            No communications logged yet. Send a quote or invoice to see history here.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-800 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {item.title}
                  </p>
                  <p className="hb-muted text-sm">
                    {item.customerName || "Unknown contact"}
                    {item.jobTitle ? ` • ${item.jobTitle}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <p className="font-medium capitalize">
                    {item.direction} · {item.channel}
                  </p>
                  <p>{formatTimestamp(item.timestamp)}</p>
                </div>
              </div>

              {item.body && (
                <p className="hb-muted text-sm mt-2 whitespace-pre-wrap">
                  {item.body}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                {item.jobId && (
                  <Link
                    href={`/jobs/${item.jobId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    View job
                  </Link>
                )}
                {item.status && <span>Status: {item.status}</span>}
                <span className="rounded-full border border-slate-800 px-2 py-1 text-[11px] uppercase tracking-wide">
                  {item.type}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
