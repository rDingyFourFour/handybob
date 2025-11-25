import Link from "next/link";

import { createServerClient } from "@/utils/supabase/server";
import { sendCustomerMessageEmail } from "@/utils/email/sendCustomerMessage";
import { sendCustomerSms } from "@/lib/domain/sms";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { ComposeBar } from "./ComposeBar";

type CustomerRow = {
  id: string | null;
  name: string | null;
  email?: string | null;
  phone?: string | null;
};

type MessageRow = {
  id: string;
  customer_id: string | null;
  job_id: string | null;
  direction: string | null;
  channel: string | null;
  via: string | null;
  subject: string | null;
  body: string | null;
  created_at: string | null;
  sent_at: string | null;
  customers: CustomerRow | CustomerRow[] | null;
};

type Thread = {
  key: string;
  customerId: string | null;
  customerName: string;
  lastDirection: string;
  lastTimestamp: string | null;
  snippet: string;
};

function normalizeCustomer(customer: CustomerRow | CustomerRow[] | null): CustomerRow | null {
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

function buildSnippet(text: string | null, fallback: string | null = null) {
  const value = (text || fallback || "").trim();
  if (!value) return "";
  return value.length > 140 ? `${value.slice(0, 140)}…` : value;
}

function messageTimestamp(msg: MessageRow) {
  return msg.sent_at || msg.created_at || null;
}

type SendConversationResult = {
  ok?: boolean;
  error?: string;
  customerId?: string | null;
};

async function sendConversationMessage(formData: FormData): Promise<SendConversationResult> {
  "use server";

  const channel = String(formData.get("channel") || "email") as "email" | "sms";
  const to = String(formData.get("to") || "").trim();
  const subject = (formData.get("subject") as string | null)?.trim() || null;
  const body = String(formData.get("body") || "").trim();
  const customerId = String(formData.get("customer_id") || "").trim() || null;
  const jobId = String(formData.get("job_id") || "").trim() || null;

  if (!to || !body) {
    console.warn("[sendConversationMessage] Missing recipient or body.");
    return { error: "Recipient and message body are required." };
  }

  const supabase = await createServerClient();
  const { user, workspace } = await getCurrentWorkspace({ supabase });
  const sentAt = new Date().toISOString();
  let errorMessage: string | null = null;

  try {
    if (channel === "email") {
      await sendCustomerMessageEmail({
        to,
        subject: subject || undefined,
        body,
      });

      const { error: insertError } = await supabase.from("messages").insert({
        user_id: user.id,
        workspace_id: workspace.id,
        customer_id: customerId,
        job_id: jobId,
        quote_id: null,
        invoice_id: null,
        direction: "outbound",
        via: channel,
        channel,
        to_address: to,
        from_address: null,
        subject,
        body,
        sent_at: sentAt,
        created_at: sentAt,
      });

      if (insertError) {
        errorMessage = insertError.message;
      }
    } else {
      const smsResult = await sendCustomerSms({
        supabase,
        workspaceId: workspace.id,
        userId: user.id,
        to,
        body,
        customerId,
        jobId,
        sentAt,
      });
      if (!smsResult.ok) {
        console.error("[sendConversationMessage] Twilio SMS failed:", smsResult.error);
        errorMessage = smsResult.error ?? "Failed to send SMS.";
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[sendConversationMessage] Failed to send message", message);
    errorMessage = message;
  }

  if (errorMessage) {
    return { error: errorMessage };
  }

  return { ok: true, customerId };
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ customerId?: string; customer_id?: string }>;
}) {
  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { data: messageRows, error } = await supabase
    .from("messages")
    .select(
      `
        id,
        customer_id,
        job_id,
        direction,
        channel,
        via,
        subject,
        body,
        created_at,
        sent_at,
        customers ( id, name, email, phone )
      `
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const messages = (messageRows ?? []) as MessageRow[];

  const threadsMap = new Map<string, Thread>();

  for (const message of messages) {
    const key = message.customer_id ?? "unknown";
    if (threadsMap.has(key)) continue;

    const customer = normalizeCustomer(message.customers);
    const ts = messageTimestamp(message);
    threadsMap.set(key, {
      key,
      customerId: message.customer_id,
      customerName: customer?.name || "Unknown contact",
      lastDirection: message.direction || "outbound",
      lastTimestamp: ts,
      snippet: buildSnippet(message.body, message.subject),
    });
  }

  const threads = Array.from(threadsMap.values()).sort((a, b) => {
    const aTime = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
    const bTime = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
    return bTime - aTime;
  });

  const resolvedSearchParams = await searchParams;
  const paramKey = resolvedSearchParams?.customerId || resolvedSearchParams?.customer_id;
  const selectedKey =
    (paramKey && threadsMap.has(paramKey))
      ? paramKey
      : threads[0]?.key ?? null;

  const conversation = selectedKey
    ? messages
        .filter((msg) => (msg.customer_id ?? "unknown") === selectedKey)
        .sort((a, b) => {
          const aTime = messageTimestamp(a);
          const bTime = messageTimestamp(b);
          const aMs = aTime ? new Date(aTime).getTime() : 0;
          const bMs = bTime ? new Date(bTime).getTime() : 0;
          return aMs - bMs;
        })
    : [];

  const selectedThread = selectedKey ? threadsMap.get(selectedKey) : null;
  const selectedCustomer = normalizeCustomer(conversation[conversation.length - 1]?.customers)
    || normalizeCustomer(conversation[0]?.customers)
    || null;
  const jobContextId = conversation.find((msg) => msg.job_id)?.job_id ?? null;
  const customerEmail = selectedCustomer?.email ?? null;
  const customerPhone = selectedCustomer?.phone ?? null;

  return (
    <div className="space-y-4">
      <div className="hb-card space-y-1">
        <h1>Inbox</h1>
        <p className="hb-muted text-sm">
          Threads by customer with latest activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px,1fr]">
        <div className="hb-card p-0">
          <div className="border-b border-slate-800 px-4 py-3">
            <p className="text-sm font-semibold">Conversations</p>
            <p className="hb-muted text-xs">Grouped by customer</p>
          </div>
          {threads.length === 0 ? (
            <p className="hb-muted text-sm px-4 py-6">
              No messages yet. Send a quote or invoice to start a thread.
            </p>
          ) : (
            <div className="divide-y divide-slate-800">
              {threads.map((thread) => {
                const isActive = thread.key === selectedKey;
                return (
                  <Link
                    key={thread.key}
                    href={`/inbox?customer_id=${thread.key}`}
                    className={`block px-4 py-3 transition hover:bg-slate-900/60 ${isActive ? "bg-slate-900/80" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {thread.customerName}
                        </p>
                        <p className="hb-muted text-xs line-clamp-2">
                          {thread.snippet || "No message content"}
                        </p>
                      </div>
                      <span className="text-[11px] uppercase tracking-wide rounded-full border border-slate-800 px-2 py-1">
                        {thread.lastDirection === "inbound" ? "Inbound" : "Outbound"}
                      </span>
                    </div>
                    <p className="hb-muted text-[11px] mt-1">
                      {formatTimestamp(thread.lastTimestamp)}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="hb-card space-y-3">
          {!selectedThread ? (
            <p className="hb-muted text-sm">
              Select a thread to view messages.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="space-y-1">
                  <p className="text-lg font-semibold">{selectedThread.customerName}</p>
                  <p className="hb-muted text-xs">
                    {conversation.length} message{conversation.length === 1 ? "" : "s"}
                  </p>
                  {conversation[0]?.customers && (
                    <p className="hb-muted text-xs">
                      {normalizeCustomer(conversation[0]?.customers)?.email || "No email"} ·{" "}
                      {normalizeCustomer(conversation[0]?.customers)?.phone || "No phone"}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Link
                      href={selectedThread.customerId ? `/customers?customer_id=${selectedThread.customerId}` : "/customers"}
                      className="hb-button-ghost text-xs"
                    >
                      View customer
                    </Link>
                    <Link
                      href={selectedThread.customerId ? `/jobs?customer_id=${selectedThread.customerId}` : "/jobs"}
                      className="hb-button-ghost text-xs"
                    >
                      View jobs
                    </Link>
                  </div>
                </div>
                <span className="text-xs text-slate-400">
                  Last activity: {formatTimestamp(selectedThread.lastTimestamp)}
                </span>
              </div>

              {conversation.length === 0 ? (
                <p className="hb-muted text-sm">
                  No messages for this customer yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {conversation.map((message) => {
                    const isOutbound = message.direction !== "inbound";
                    const alignClass = isOutbound ? "items-end text-right" : "items-start text-left";
                    const bubbleClass = isOutbound
                      ? "bg-slate-800/80 text-slate-50"
                      : "bg-slate-900/80 text-slate-100";
                    const timestamp = message.sent_at || message.created_at;
                    return (
                      <div key={message.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] space-y-1 ${alignClass}`}>
                          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
                            <span className="uppercase tracking-wide">
                              {isOutbound ? "Outbound" : "Inbound"}
                            </span>
                            <span className="rounded-full border border-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide">
                              {message.via?.toUpperCase() || message.channel?.toUpperCase() || "Message"}
                            </span>
                            <span>{formatTimestamp(timestamp)}</span>
                          </div>
                          <div className={`rounded-xl border border-slate-800 px-3 py-2 shadow-sm ${bubbleClass}`}>
                            <p className="text-sm whitespace-pre-wrap">
                              {message.body || message.subject || "No content"}
                            </p>
                            {message.job_id && (
                              <div className="mt-2 text-[11px]">
                                <Link
                                  href={`/jobs/${message.job_id}`}
                                  className="underline-offset-2 hover:underline"
                                >
                                  View job timeline
                                </Link>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="border-t border-slate-800 pt-3">
                <ComposeBar
                  action={sendConversationMessage}
                  customerId={selectedThread.customerId}
                  jobId={jobContextId}
                  customerName={selectedThread.customerName}
                  customerEmail={customerEmail}
                  customerPhone={customerPhone}
                />
              </div>
            </>
          )}
          {error && (
            <p className="text-sm text-red-400">
              Failed to load messages: {error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
