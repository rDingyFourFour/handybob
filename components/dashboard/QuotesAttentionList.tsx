"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import { formatCurrency } from "@/utils/timeline/formatters";
import { daysSince } from "@/utils/dashboard/time";
import { normalizeCustomer } from "@/utils/dashboard/customers";
import { AttentionListRow, AttentionListRowData } from "./AttentionListRow";

export function QuotesAttentionList({
  workspaceId,
  quoteStaleThresholdIso,
  maxItems = 3,
}: {
  workspaceId: string;
  quoteStaleThresholdIso: string;
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

    const loadQuotes = async () => {
      setStatus("loading");
      setErrorMessage(null);

      const { data, error } = await supabaseClient
        .from("quotes")
        .select(
          `
            id,
            status,
            total,
            created_at,
            job_id,
            job:jobs (
              title,
              customers ( name )
            )
          `
        )
        .eq("workspace_id", workspaceId)
        .eq("status", "sent")
        .lt("created_at", quoteStaleThresholdIso)
        .order("created_at", { ascending: true })
        .limit(10);

      if (canceled) return;

      if (error) {
        setErrorMessage(error.message || "Unable to load quotes right now.");
        setStatus("error");
        return;
      }

      const formatted = (data ?? []).slice(0, maxItems).map<AttentionListRowData>((quote) => {
        const job = Array.isArray(quote.job) ? quote.job[0] ?? null : quote.job ?? null;
        const customers = normalizeCustomer(job?.customers);
        const jobTitle = job?.title || "job";
        const recipient = customers?.name || jobTitle;
        const quoteAge = daysSince(quote.created_at);
        return {
          id: quote.id,
          primary: jobTitle,
          amount: formatCurrency(quote.total ?? 0),
          meta: `Sent ${quoteAge ?? "—"} day${quoteAge === 1 ? "" : "s"} ago`,
          secondary: `Quote for ${recipient}`,
          tag: quote.status || "sent",
          actions: [
            { label: "Send reminder", href: `/quotes/${quote.id}`, variant: "ghost" },
            { label: "Follow up", href: `/quotes/${quote.id}?action=follow-up`, variant: "ghost" },
          ],
          dismissType: "quote",
          href: `/quotes/${quote.id}`,
        };
      });

      setItems(formatted);
      setStatus("idle");
    };

    void loadQuotes();

    return () => {
      canceled = true;
    };
  }, [workspaceId, quoteStaleThresholdIso, maxItems, refreshIndex, supabaseClient]);

  const retry = () => setRefreshIndex((value) => value + 1);

  if (status === "error") {
    return (
      <div className="rounded border border-slate-800 px-3 py-3 text-sm text-slate-300">
        <p className="text-sm text-slate-200">{errorMessage || "Unable to load quotes right now."}</p>
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
    return <p className="hb-muted text-xs">No quotes waiting.</p>;
  }

  return (
    <div className="space-y-0 divide-y divide-slate-800/70">
      {items.map((item) => (
        <AttentionListRow key={item.id} item={item} />
      ))}
    </div>
  );
}
