"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import { formatFriendlyDateTime, formatRelativeMinutesAgo } from "@/utils/dashboard/time";
import { AttentionListRow, AttentionListRowData } from "./AttentionListRow";

export function CallsAttentionList({
  workspaceId,
  workspaceTimeZone,
  maxItems = 3,
}: {
  workspaceId: string;
  workspaceTimeZone?: string | null;
  maxItems?: number;
}) {
  const [items, setItems] = useState<AttentionListRowData[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const supabaseClient = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!workspaceId) return;

    let canceled = false;

    const loadCalls = async () => {
      setStatus("loading");
      setErrorMessage(null);

      const { data, error } = await supabaseClient
        .from("calls")
        .select(
          `
            id,
            status,
            created_at,
            from_number,
            priority,
            needs_followup,
            attention_reason,
            ai_urgency,
            job_id,
            jobs ( id, title ),
            customers ( id, name )
          `
        )
        .eq("workspace_id", workspaceId)
        .or("transcript.is.null,ai_summary.is.null,job_id.is.null,needs_followup.eq.true")
        .order("created_at", { ascending: false })
        .limit(5);

      if (canceled) return;

      if (error) {
        setErrorMessage(error.message || "Unable to load calls right now.");
        setStatus("error");
        return;
      }

      const formatted = (data ?? []).slice(0, maxItems).map<AttentionListRowData>((call) => {
        const friendly = formatFriendlyDateTime(call.created_at, null, workspaceTimeZone ?? undefined);
        const relative = formatRelativeMinutesAgo(call.created_at);
        return {
          id: call.id,
          primary: call.from_number || "Unknown number",
          secondary: friendly,
          meta: relative,
          tag: (call.ai_urgency || call.priority || "follow-up").toLowerCase(),
          actions: [
            { label: "Review call", href: `/calls/${call.id}`, variant: "ghost" },
            { label: "Transcribe call", href: `/calls/${call.id}?action=transcribe`, variant: "ghost" },
          ],
          dismissType: "call",
          href: `/calls/${call.id}`,
        };
      });

      setItems(formatted);
      setStatus("idle");
    };

    void loadCalls();

    return () => {
      canceled = true;
    };
  }, [workspaceId, workspaceTimeZone, maxItems, refreshIndex, supabaseClient]);

  const retry = () => setRefreshIndex((value) => value + 1);

  if (status === "error") {
    return (
      <div className="rounded border border-slate-800 px-3 py-3 text-sm text-slate-300">
        <p className="text-sm text-slate-200">{errorMessage || "Unable to load calls right now."}</p>
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

  if (items.length === 0) {
    return <p className="hb-muted text-xs">All calls processed.</p>;
  }

  return (
    <div className="space-y-0 divide-y divide-slate-800/70">
      {items.map((item) => (
        <AttentionListRow key={item.id} item={item} />
      ))}
    </div>
  );
}
