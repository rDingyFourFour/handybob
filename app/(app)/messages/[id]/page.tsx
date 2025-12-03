export const dynamic = "force-dynamic";

import Link from "next/link";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type MessageRecord = {
  id: string;
  subject: string | null;
  body: string | null;
  channel: string | null;
  via: string | null;
  job_id: string | null;
  quote_id: string | null;
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

type StatusCardProps = {
  title: string;
  subtitle: string;
};

function renderStatusCard({ title, subtitle }: StatusCardProps) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-4">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-slate-400">{subtitle}</p>
        <HbButton as={Link} href="/messages" size="sm">
          Back to messages
        </HbButton>
      </HbCard>
    </div>
  );
}

export default async function MessageDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await paramsPromise;

  if (!id || !id.trim()) {
    return renderStatusCard({
      title: "Message not found",
      subtitle: "We couldn’t resolve that message. Go back to the inbox to continue.",
    });
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[messages/[id]] Failed to init Supabase client", error);
    return renderStatusCard({
      title: "Unable to load message",
      subtitle: "We had trouble connecting to the database. Try again in a moment.",
    });
  }

  let workspace;
  try {
    const workspaceResult = await getCurrentWorkspace({ supabase });
    workspace = workspaceResult.workspace;
  } catch (error) {
    console.error("[messages/[id]] Failed to resolve workspace", error);
    return renderStatusCard({
      title: "Access denied",
      subtitle: "We couldn’t verify your workspace context. Please try again.",
    });
  }

  if (!workspace) {
    return renderStatusCard({
      title: "Access denied",
      subtitle: "This message is not available in your workspace.",
    });
  }

  let message: MessageRecord | null = null;
  try {
    const { data, error } = await supabase
      .from<MessageRecord>("messages")
      .select("id, subject, body, channel, via, job_id, quote_id, created_at")
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    message = data ?? null;
  } catch (error) {
    console.error("[messages/[id]] Failed to load message", { id, error });
    return renderStatusCard({
      title: "Message not found",
      subtitle: "This message is either missing or not accessible right now.",
    });
  }

  if (!message) {
    return renderStatusCard({
      title: "Message not found",
      subtitle: "This message is either deleted or belongs to another workspace.",
    });
  }

  const subject = message.subject?.trim() || "(no subject)";
  const createdAtLabel = formatDate(message.created_at);
  const channelLabel = message.channel?.trim() || "Unknown";
  const viaLabel = message.via?.trim() || "Unknown";

  return (
    <div className="hb-shell pt-20 pb-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <HbCard className="space-y-6">
          <header className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Message details</p>
                <h1 className="hb-heading-2 text-2xl font-semibold text-slate-100">{subject}</h1>
              </div>
              <Link
                href="/messages"
                className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 hover:text-slate-200"
              >
                Back to messages
              </Link>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.3em] text-slate-500">
              <span className="rounded-full border border-slate-800/60 bg-slate-900/60 px-2 py-0.5 text-slate-300">
                Channel: {channelLabel}
              </span>
              <span className="rounded-full border border-slate-800/60 bg-slate-900/60 px-2 py-0.5 text-slate-300">
                Via: {viaLabel}
              </span>
              <span className="rounded-full border border-slate-800/60 bg-slate-900/60 px-2 py-0.5 text-slate-300">
                Created: {createdAtLabel}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-400">
              {message.job_id && (
                <Link
                  href={`/jobs/${message.job_id}`}
                  className="text-sky-300 hover:text-sky-200"
                >
                  Related job
                </Link>
              )}
              {message.quote_id && (
                <Link
                  href={`/quotes/${message.quote_id}`}
                  className="text-sky-300 hover:text-sky-200"
                >
                  Related quote
                </Link>
              )}
              {!message.job_id && !message.quote_id && (
                <p className="text-xs text-slate-500">No linked job or quote</p>
              )}
            </div>
          </header>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Message body</p>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100">
              {message.body?.trim() ? (
                <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                  {message.body}
                </pre>
              ) : (
                <p className="text-sm text-slate-500">No body content for this message.</p>
              )}
            </div>
          </div>
        </HbCard>
      </div>
    </div>
  );
}
