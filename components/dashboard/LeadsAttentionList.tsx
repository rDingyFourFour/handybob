"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import { aiUrgencyRank } from "@/utils/dashboard/urgency";
import { daysSince } from "@/utils/dashboard/time";
import { formatLeadSourceLabel } from "@/utils/dashboard/leads";
import { normalizeCustomer } from "@/utils/dashboard/customers";
import { AttentionListRow, AttentionListRowData } from "./AttentionListRow";

export function LeadsAttentionList({
  workspaceId,
  windowStartIso,
  maxItems = 3,
}: {
  workspaceId: string;
  windowStartIso: string;
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

    const loadLeads = async () => {
      setStatus("loading");
      setErrorMessage(null);

      const { data, error } = await supabaseClient
        .from("jobs")
        .select(
          `
            id,
            title,
            urgency,
            source,
            ai_urgency,
            attention_reason,
            created_at,
            customer:customers ( name )
          `
        )
        .eq("workspace_id", workspaceId)
        .eq("status", "lead")
        .gte("created_at", windowStartIso)
        .order("created_at", { ascending: false })
        .limit(15);

      if (canceled) return;

      if (error) {
        setErrorMessage(error.message || "Unable to load leads right now.");
        setStatus("error");
        return;
      }

      const sorted = (data ?? []).sort(
        (a, b) =>
          aiUrgencyRank(a.ai_urgency || a.urgency) - aiUrgencyRank(b.ai_urgency || b.urgency)
      );

      const newItems = sorted.slice(0, maxItems).map<AttentionListRowData>((lead) => {
        const customer = normalizeCustomer(lead.customer);
        const leadName = customer?.name || "Unknown customer";
        const sourceLabel = formatLeadSourceLabel(lead.source);
        const leadAge = daysSince(lead.created_at);
        return {
          id: lead.id,
          primary: lead.title || "Lead",
          secondary: `Caller: ${leadName} • ${sourceLabel}`,
          meta: `Lead opened ${leadAge ?? "—"} day${leadAge === 1 ? "" : "s"} ago`,
          tag: (lead.ai_urgency || lead.urgency)?.toLowerCase() || "lead",
          actions: [{ label: "Follow up", href: `/jobs/${lead.id}`, variant: "ghost" }],
          dismissType: "lead",
          href: `/jobs/${lead.id}`,
        };
      });

      setItems(newItems);
      setStatus("idle");
    };

    void loadLeads();

    return () => {
      canceled = true;
    };
  }, [workspaceId, windowStartIso, maxItems, refreshIndex, supabaseClient]);

  const retry = () => setRefreshIndex((value) => value + 1);

  if (status === "error") {
    return (
      <div className="rounded border border-slate-800 px-3 py-3 text-sm text-slate-300">
        <p className="text-sm text-slate-200">{errorMessage || "Unable to load leads right now."}</p>
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
    return <p className="hb-muted text-xs">No new leads.</p>;
  }

  return (
    <div className="space-y-0 divide-y divide-slate-800/70">
      {items.map((item) => (
        <AttentionListRow key={item.id} item={item} />
      ))}
    </div>
  );
}
