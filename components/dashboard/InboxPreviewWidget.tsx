"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import { formatFriendlyDateTime, formatRelativeMinutesAgo } from "@/utils/dashboard/time";
import { normalizeCustomer } from "@/utils/dashboard/customers";
import { MessagesSkeleton } from "./MessagesSkeleton";

export type MessageThreadRow = {
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

type Props = {
  workspaceId: string;
  windowStartIso: string;
  workspaceTimeZone?: string | null;
  maxItems?: number;
};

function buildMessageSnippet(text: string | null, fallback: string | null = null) {
  const value = (text || fallback || "").trim();
  if (!value) return "";
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

export function InboxPreviewWidget({
  workspaceId,
  windowStartIso,
  workspaceTimeZone,
  maxItems = 3,
}: Props) {
  const [threads, setThreads] = useState<MessageThreadRow[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const supabaseClient = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!workspaceId) return;

    let canceled = false;

    const loadThreads = async () => {
      setStatus("loading");
      setErrorMessage(null);

      const { data, error } = await supabaseClient
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
        .eq("workspace_id", workspaceId)
        .eq("direction", "inbound")
        .gte("created_at", windowStartIso)
        .order("created_at", { ascending: false })
        .limit(15);

      if (canceled) return;

      if (error) {
        setErrorMessage(error.message || "Unable to load messages right now.");
        setStatus("error");
        return;
      }

      const dedup = new Map<string, MessageThreadRow>();
      for (const row of data ?? []) {
        const key = row.customer_id ?? row.job_id ?? row.id;
        if (!key || dedup.has(key)) continue;
        dedup.set(key, row);
        if (dedup.size >= maxItems) break;
      }

      setThreads(Array.from(dedup.values()));
      setStatus("idle");
    };

    void loadThreads();

    return () => {
      canceled = true;
    };
  }, [workspaceId, windowStartIso, maxItems, refreshIndex, supabaseClient]);

  const retry = () => setRefreshIndex((value) => value + 1);

  if (status === "error") {
    return (
      <div className="rounded border border-slate-800 px-3 py-3 text-sm text-slate-300">
        <p className="text-sm text-slate-200">{errorMessage || "Unable to load messages right now."}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-2 text-[11px] text-slate-400 hover:text-slate-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return <MessagesSkeleton rows={maxItems} />;
  }

  if (!threads.length) {
    return <p className="hb-muted text-sm">No inbound messages waiting right now.</p>;
  }

  return (
    <div className="space-y-0 divide-y divide-slate-800/60">
      {threads.map((msg) => {
        const customer = normalizeCustomer(msg.customers);
        const customerName = customer?.name || "Unknown contact";
        const job = Array.isArray(msg.job) ? msg.job[0] ?? null : msg.job ?? null;
        const jobTitle = job?.title || "No job linked";
        const timestamp = msg.sent_at || msg.created_at || "";
        const timestampLabel = formatFriendlyDateTime(timestamp, null, workspaceTimeZone ?? undefined);
        const snippet = buildMessageSnippet(msg.body, msg.subject);
        const receivedLabel = formatRelativeMinutesAgo(timestamp);
        const inboxLink = msg.customer_id ? `/inbox?customer_id=${msg.customer_id}` : "/inbox";

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
  );
}
