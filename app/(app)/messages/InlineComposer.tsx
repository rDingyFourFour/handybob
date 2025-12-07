"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { sendCustomerSmsAction } from "@/app/actions/messages";

type MessageRow = {
  id: string;
  subject: string | null;
  body: string | null;
  status: string | null;
  channel: string | null;
  created_at: string | null;
  sent_at: string | null;
  job_id: string | null;
  customer_id: string | null;
  isCallFollowup: boolean;
  isJobOrQuoteMessage: boolean;
};

type MessageComposeFormProps = {
  workspaceId: string;
  customerId: string | null;
  jobId: string | null;
  origin: "inline" | "top-level" | "dialog";
  hideCancel?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
};

type InlineComposerProps = {
  message: MessageRow;
  workspaceId: string;
  onClose: () => void;
};

type MessagesWithInlineRepliesProps = {
  workspaceId: string;
  filteredMessages: MessageRow[];
  callIdByMessageId: Record<string, string>;
};

type TopLevelComposerProps = {
  workspaceId: string;
  customerId: string | null;
  jobId: string | null;
};

function parseTimestampValue(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

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

function formatShortDate(value: string | null) {
  const parsed = parseTimestampValue(value);
  if (!parsed) return "—";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function bodyPreview(body: string | null) {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) return "No preview available";
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
}

function MessageComposeForm({
  workspaceId,
  customerId,
  jobId,
  origin,
  hideCancel,
  onCancel,
  onSuccess,
}: MessageComposeFormProps) {
  const [messageBody, setMessageBody] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const trimmedBody = messageBody.trim();
  const canSubmit = Boolean(customerId && trimmedBody.length > 0);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isPending) {
      if (!customerId) {
        setErrorMessage("Customer context is required to send a message.");
      } else {
        setErrorMessage("Type a message before sending.");
      }
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await sendCustomerSmsAction({
          workspaceId,
          customerId: customerId!,
          jobId,
          body: trimmedBody,
          origin,
        });

        if (!result?.ok) {
          setErrorMessage(result?.error ?? "We couldn’t send this message. Please try again.");
          return;
        }

        setMessageBody("");
        onSuccess?.();
        router.refresh();
      } catch (error) {
        console.error("[messages-compose-error] Client submit failed:", error);
        setErrorMessage("We couldn’t send this message. Please try again.");
      }
    });
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="customerId" value={customerId ?? ""} />
      {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}
      <input type="hidden" name="origin" value={origin} />
      <div>
        <label htmlFor={`inline-message-body-${origin}`} className="text-xs uppercase tracking-[0.3em] text-slate-500">
          Message
        </label>
        <textarea
          id={`inline-message-body-${origin}`}
          name="body"
          value={messageBody}
          onChange={(event) => setMessageBody(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          className="mt-2 w-full min-h-[96px] rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-600"
          rows={3}
        />
      </div>
      {errorMessage && <p className="text-xs text-rose-400">{errorMessage}</p>}
      <div className="flex items-center justify-between gap-3">
        <HbButton type="submit" size="sm" disabled={!canSubmit || isPending}>
          {isPending ? "Sending…" : "Send message"}
        </HbButton>
        {!hideCancel && (
          <button
            type="button"
            className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400 hover:text-slate-200"
            onClick={() => {
              setMessageBody("");
              onCancel?.();
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function InlineComposer({ message, workspaceId, onClose }: InlineComposerProps) {
  if (!message.customer_id) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
      <MessageComposeForm
        workspaceId={workspaceId}
        customerId={message.customer_id}
        jobId={message.job_id}
        origin="inline"
        onCancel={onClose}
        onSuccess={onClose}
      />
    </div>
  );
}

export function MessagesWithInlineReplies({
  workspaceId,
  filteredMessages,
  callIdByMessageId,
}: MessagesWithInlineRepliesProps) {
  const [openComposerId, setOpenComposerId] = useState<string | null>(null);
  const filteredCount = filteredMessages.length;

  useEffect(() => {
    console.log("[messages-inline-debug]", { openComposerId, filteredCount });
  }, [openComposerId, filteredCount]);

  if (filteredMessages.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {filteredMessages.map((message) => {
        const subject = message.subject?.trim() || "(no subject)";
        const preview = bodyPreview(message.body);
        const statusLabel = message.status ?? "Unknown";
        const channelLabel =
          typeof message.channel === "string" && message.channel.length > 0
            ? `${message.channel.charAt(0).toUpperCase()}${message.channel.slice(1)}`
            : "—";
        const timestamp = formatDate(message.sent_at ?? message.created_at);
        const relatedShortDate = formatShortDate(message.created_at ?? message.sent_at);
        const jobContextLabel = message.job_id ? `#${message.job_id.slice(0, 8)}` : null;
        const relatedStub = jobContextLabel
          ? `Job • ${jobContextLabel}`
          : message.isCallFollowup
          ? `Call • ${relatedShortDate}`
          : `Message • ${relatedShortDate}`;
        const callIdForMessage = callIdByMessageId[message.id] ?? null;
        const primaryActionClass =
          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition bg-slate-50 text-slate-950 shadow-sm shadow-slate-900/40";
        const secondaryActionClass =
          "rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition text-slate-400 hover:border-slate-600";
        const tertiaryActionClass =
          "rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] transition text-slate-400 hover:border-slate-600";

        return (
          <div key={message.id} className="space-y-2">
            <article className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4 transition hover:border-slate-600">
              <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Subject:</p>
                      <p className="text-sm font-semibold text-slate-100">{subject}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {message.isCallFollowup && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                          Call follow-up
                        </span>
                      )}
                      {!message.isCallFollowup && message.isJobOrQuoteMessage && (
                        <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                          Job/quote message
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Body:</p>
                    <p className="text-sm text-slate-500">{preview}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-400">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status: {statusLabel}</p>
                    {message.isCallFollowup && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                        Follow-up
                      </span>
                    )}
                  </div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Channel: {channelLabel}</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Sent: {timestamp}</p>
                  <p className="text-[11px] text-slate-500">
                    Related: <span className="text-slate-400">{relatedStub}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/messages/${message.id}`} className={primaryActionClass}>
                      View message
                    </Link>
                    {message.job_id && (
                      <Link href={`/jobs/${message.job_id}`} className={secondaryActionClass}>
                        Open job
                      </Link>
                    )}
                    {callIdForMessage && (
                      <Link href={`/calls/${callIdForMessage}`} className={secondaryActionClass}>
                        Open call
                      </Link>
                    )}
                    <button
                      type="button"
                      className={tertiaryActionClass}
                      onClick={() =>
                        setOpenComposerId((previous) => (previous === message.id ? null : message.id))
                      }
                    >
                      Reply inline
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-sky-300">
                    {message.job_id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-slate-500">Job:</span>
                        <Link href={`/jobs/${message.job_id}`} className="text-sky-300 hover:text-sky-200">
                          View job
                        </Link>
                      </span>
                    ) : null}
                    {message.customer_id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-slate-500">Customer:</span>
                        <Link
                          href={`/customers/${message.customer_id}`}
                          className="text-sky-300 hover:text-sky-200"
                        >
                          View customer
                        </Link>
                      </span>
                    ) : null}
                    {!message.job_id && !message.customer_id && (
                      <span className="text-slate-500">No linked context</span>
                    )}
                  </div>
                </div>
              </div>
            </article>
            {openComposerId === message.id && (
              <InlineComposer
                message={message}
                workspaceId={workspaceId}
                onClose={() => setOpenComposerId(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TopLevelComposer({ workspaceId, customerId, jobId }: TopLevelComposerProps) {
  if (!customerId) {
    return null;
  }

  return (
    <HbCard className="space-y-3 border border-slate-800/60 bg-slate-900/60 px-4 py-4">
      <p className="text-sm font-semibold text-muted-foreground">New message</p>
      <MessageComposeForm
        workspaceId={workspaceId}
        customerId={customerId}
        jobId={jobId}
        origin="top-level"
        hideCancel
      />
    </HbCard>
  );
}
