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
  sent_at: string | null;
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

type ShellCardProps = {
  title: string;
  subtitle: string;
  buttonLabel?: string;
  buttonHref?: string;
};

function renderShellCard({
  title,
  subtitle,
  buttonLabel = "Back to dashboard",
  buttonHref = "/dashboard",
}: ShellCardProps) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{subtitle}</p>
        <HbButton as="a" href={buttonHref} size="sm">
          {buttonLabel}
        </HbButton>
      </HbCard>
    </div>
  );
}

const bodyPreview = (body: string | null) => {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) return "No preview available";
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
};

export default async function MessagesPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[messages] Failed to init Supabase client:", error);
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  let user;
  try {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    user = currentUser;
  } catch (error) {
    console.error("[messages] Failed to fetch auth user:", error);
  }

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
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  if (!workspace) {
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  let messages: MessageRecord[];
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
          created_at,
          sent_at
        `
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    messages = data ?? [];
  } catch (error) {
    console.error("[messages] Failed to load messages:", error);
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  if (messages.length === 0) {
    return renderShellCard({
      title: "No messages yet",
      subtitle: "There's nothing to show here yet.",
      buttonLabel: "View jobs",
      buttonHref: "/jobs",
    });
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="hb-heading-2 text-2xl font-semibold">Messages</h1>
            <p className="text-sm text-slate-400">Recent messages across your jobs.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HbButton as="a" href="/messages" variant="ghost" size="sm">
              Back to messages
            </HbButton>
            <HbButton as="a" href="/customers" variant="secondary" size="sm">
              View customers
            </HbButton>
          </div>
        </header>

        <div className="space-y-3">
          {messages.map((message) => {
            const subject = message.subject?.trim() || "(no subject)";
            const preview = bodyPreview(message.body);
            const statusLabel = message.status ?? "Unknown";
            const channelLabel = message.channel?.charAt(0).toUpperCase() + message.channel?.slice(1);
            const timestamp = formatDate(message.sent_at ?? message.created_at);

            return (
              <article
                key={message.id}
                className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4 transition hover:border-slate-600"
              >
                <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Subject:</p>
                      <p className="text-sm font-semibold text-slate-100">{subject}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Body:</p>
                      <p className="text-sm text-slate-500">{preview}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-slate-400">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status: {statusLabel}</p>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      Channel: {channelLabel ?? "—"}
                    </p>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Sent: {timestamp}</p>
                    <div className="flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-sky-300">
                      {message.job_id && (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-500">Job:</span>
                          <Link href={`/jobs/${message.job_id}`} className="text-sky-300 hover:text-sky-200">
                            View job
                          </Link>
                        </span>
                      )}
                      {message.customer_id && (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-500">Customer:</span>
                          <Link
                            href={`/customers/${message.customer_id}`}
                            className="text-sky-300 hover:text-sky-200"
                          >
                            View customer
                          </Link>
                        </span>
                      )}
                      {!message.job_id && !message.customer_id && (
                        <span className="text-slate-500">No linked context</span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </HbCard>
    </div>
  );
}
