export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type MessageRecord = {
  id: string;
  direction: string | null;
  channel: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  external_id: string | null;
  customer_id: string | null;
  job_id: string | null;
  created_at: string | null;
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
        <HbButton as="a" href="/dashboard" size="sm">
          Back to dashboard
        </HbButton>
      </HbCard>
    </div>
  );
}

export default async function MessagesPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[messages] Failed to init Supabase client:", error);
    return fallbackCard("Messages unavailable", "Could not connect to Supabase. Please try again.");
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
    console.error("[messages] Failed to resolve workspace:", error);
    return fallbackCard("Messages unavailable", "Unable to resolve workspace. Please sign in again.");
  }

  if (!workspace) {
    return fallbackCard("Messages unavailable", "Unable to resolve workspace. Please sign in again.");
  }

  let messages: MessageRecord[] = [];

  try {
    const { data, error } = await supabase
      .from<MessageRecord>("messages")
      .select(
        `
          id,
          direction,
          channel,
          subject,
          body,
          status,
          external_id,
          customer_id,
          job_id,
          created_at
        `
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[messages] Failed to load messages:", error);
      return fallbackCard("Messages unavailable", "Could not load workspace messages. Please try again.");
    }

    messages = data ?? [];
  } catch (error) {
    console.error("[messages] Failed to load messages:", error);
    return fallbackCard("Messages unavailable", "Could not load workspace messages. Please try again.");
  }

  const bodyPreview = (body: string | null) => {
    const trimmed = body?.trim() ?? "";
    if (!trimmed) return "No preview available";
    return trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;
  };

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-4">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Messages</p>
            <h1 className="hb-heading-2 text-2xl font-semibold">Recent conversations</h1>
            <p className="text-sm text-slate-400">Recent messages across jobs and customers.</p>
          </div>
          <div className="flex gap-2">
            <HbButton as="a" href="/dashboard" variant="ghost" size="sm">
              Back to dashboard
            </HbButton>
            <HbButton as="a" href="/jobs" size="sm">
              View jobs
            </HbButton>
          </div>
        </header>

        {messages.length === 0 ? (
          <div className="space-y-2 text-sm text-slate-400">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">No messages yet</p>
            <p>You haven’t exchanged messages in this workspace yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 transition hover:border-slate-600"
              >
                <div className="flex flex-col gap-1 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      {message.direction === "inbound" ? "Inbound" : "Outbound"} ·{" "}
                      {message.channel ?? "message"}
                    </p>
                    <p className="text-base font-semibold text-slate-100">
                      {message.subject?.trim() || "(no subject)"}
                    </p>
                    <p className="text-sm text-slate-400">{bodyPreview(message.body)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                    <span>{formatDate(message.created_at)}</span>
                    <span>{message.status ?? "status unknown"}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.3em]">
                  {message.job_id && (
                    <Link href={`/jobs/${message.job_id}`} className="text-sky-300 hover:text-sky-200">
                      View job
                    </Link>
                  )}
                  {message.customer_id && (
                    <Link href={`/customers/${message.customer_id}`} className="text-sky-300 hover:text-sky-200">
                      View customer
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </HbCard>
    </div>
  );
}
