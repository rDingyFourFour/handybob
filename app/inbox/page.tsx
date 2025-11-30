export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type MessageRow = {
  id: string;
  direction: string | null;
  channel: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  customer_id: string | null;
  job_id: string | null;
  created_at: string | null;
  sent_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bodyPreview(body: string | null) {
  const trimmed = (body || "").trim();
  if (!trimmed) return "(no preview)";
  if (trimmed.length <= 100) return trimmed;
  return `${trimmed.slice(0, 100)}…`;
}

function fallbackCard(title: string, body: string) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <HbButton as="a" href="/dashboard" size="sm">
          Back to dashboard
        </HbButton>
      </HbCard>
    </div>
  );
}

export default async function InboxPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const customerFilter =
    Array.isArray(searchParams.customerId)
      ? searchParams.customerId[0]
      : searchParams.customerId ?? (Array.isArray(searchParams.customer_id) ? searchParams.customer_id[0] : searchParams.customer_id);
  const jobFilter = Array.isArray(searchParams.jobId) ? searchParams.jobId[0] : searchParams.jobId;
  const statusFilter = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status;
  const directionFilter =
    Array.isArray(searchParams.direction) ? searchParams.direction[0] : searchParams.direction;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[inbox] Failed to init Supabase client:", error);
    return fallbackCard("Inbox unavailable", "Could not connect to Supabase. Please try again.");
  }

  let user;
  try {
    const {
      data: { user: claimedUser },
    } = await supabase.auth.getUser();
    user = claimedUser;
  } catch (error) {
    console.error("[inbox] Failed to resolve user:", error);
    redirect("/");
    return null;
  }

  if (!user) {
    redirect("/");
    return null;
  }

  let workspace;
  try {
    const context = await getCurrentWorkspace({ supabase });
    workspace = context.workspace;
  } catch (error) {
    console.error("[inbox] Failed to resolve workspace:", error);
    return fallbackCard(
      "Inbox unavailable",
      "Unable to resolve workspace. Please sign in again.",
    );
  }

  if (!workspace) {
    return fallbackCard(
      "Inbox unavailable",
      "Unable to resolve workspace. Please sign in again.",
    );
  }

  let messages: MessageRow[] = [];
  try {
    let query = supabase
      .from<MessageRow>("messages")
      .select("id, direction, channel, subject, body, status, customer_id, job_id, created_at, sent_at")
      .eq("workspace_id", workspace.id);

    if (customerFilter) {
      query = query.eq("customer_id", customerFilter);
    }
    if (jobFilter) {
      query = query.eq("job_id", jobFilter);
    }
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (directionFilter) {
      query = query.eq("direction", directionFilter);
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(200);

    if (error) {
      console.error("[inbox] Message lookup failed:", error);
      return fallbackCard("Inbox unavailable", "Could not load inbox messages. Please try again.");
    }

    messages = (data ?? []) as MessageRow[];
  } catch (error) {
    console.error("[inbox] Message query error:", error);
    return fallbackCard("Inbox unavailable", "Could not load inbox messages. Please try again.");
  }

  if (messages.length === 0) {
    return (
      <div className="hb-shell pt-20 pb-8">
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Inbox</h1>
          <p className="hb-muted text-sm">No messages yet in this workspace.</p>
          <HbButton as="a" href="/dashboard" size="sm">
            Back to dashboard
          </HbButton>
        </HbCard>
      </div>
    );
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-4">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Inbox</p>
            <h1 className="hb-heading-2 text-2xl font-semibold">Inbox</h1>
            <p className="text-sm text-slate-400">Recent conversations across channels.</p>
          </div>
          <div className="flex gap-2">
            <HbButton as="a" href="/dashboard" variant="ghost" size="sm">
              Back to dashboard
            </HbButton>
            <HbButton as="a" href="/messages" size="sm">
              View messages
            </HbButton>
          </div>
        </header>

        <div className="space-y-3">
          {messages.map((message) => {
            const directionLabel = `${message.direction === "inbound" ? "Inbound" : "Outbound"} ${
              message.channel ? message.channel.charAt(0).toUpperCase() + message.channel.slice(1) : ""
            }`.trim();
            const subject = message.subject?.trim() || "(no subject)";
            const preview = bodyPreview(message.body);
            const timestamp = formatDate(message.sent_at ?? message.created_at);
            return (
              <div
                key={message.id}
                className="group flex flex-col gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 transition hover:border-slate-600 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1 text-sm text-slate-400">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{directionLabel}</p>
                  <p className="text-base font-semibold text-slate-100">{subject}</p>
                  <p className="text-sm text-slate-500">{preview}</p>
                </div>
                <div className="flex flex-col items-end gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                  <span>{timestamp}</span>
                  <span>{message.status ?? "status unknown"}</span>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {message.job_id ? (
                      <Link href={`/jobs/${message.job_id}`} className="text-sky-300 hover:text-sky-200">
                        Job {message.job_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span>—</span>
                    )}
                    {message.customer_id ? (
                      <Link href={`/customers/${message.customer_id}`} className="text-sky-300 hover:text-sky-200">
                        Customer {message.customer_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </HbCard>
    </div>
  );
}
