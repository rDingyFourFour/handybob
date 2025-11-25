"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import { formatCurrency } from "@/utils/timeline/formatters";
import { daysSince } from "@/utils/dashboard/time";
import { normalizeCustomer } from "@/utils/dashboard/customers";
import { AttentionListRow, AttentionListRowData } from "./AttentionListRow";

export function InvoicesAttentionList({
  workspaceId,
  invoiceOverdueThresholdIso,
  maxItems = 3,
}: {
  workspaceId: string;
  invoiceOverdueThresholdIso: string;
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

    const loadInvoices = async () => {
      setStatus("loading");
      setErrorMessage(null);

      const { data, error } = await supabaseClient
        .from("invoices")
        .select(
          `
            id,
            status,
            total,
            due_at,
            job_id,
            job:jobs (
              title,
              customers ( name )
            )
          `
        )
        .eq("workspace_id", workspaceId)
        .in("status", ["sent", "overdue"])
        .lt("due_at", invoiceOverdueThresholdIso)
        .order("due_at", { ascending: true })
        .limit(10);

      if (canceled) return;

      if (error) {
        setErrorMessage(error.message || "Unable to load invoices right now.");
        setStatus("error");
        return;
      }

      const formatted = (data ?? []).slice(0, maxItems).map<AttentionListRowData>((inv) => {
        const job = Array.isArray(inv.job) ? inv.job[0] ?? null : inv.job ?? null;
        const customers = normalizeCustomer(job?.customers);
        const jobTitle = job?.title || "invoice";
        const recipient = customers?.name || jobTitle;
        const overdueDays = daysSince(inv.due_at);
        return {
          id: inv.id,
          primary: jobTitle,
          amount: formatCurrency(inv.total ?? 0),
          meta: `${overdueDays ?? 0} day${overdueDays === 1 ? "" : "s"} overdue`,
          secondary: `Invoice to ${recipient}`,
          tag: inv.status || "overdue",
          actions: [
            { label: "Open invoice", href: `/invoices/${inv.id}`, variant: "ghost" },
            { label: "Mark paid", href: `/invoices/${inv.id}?action=mark-paid`, variant: "solid" },
          ],
          dismissType: "invoice",
          href: `/invoices/${inv.id}`,
        };
      });

      setItems(formatted);
      setStatus("idle");
    };

    void loadInvoices();

    return () => {
      canceled = true;
    };
  }, [workspaceId, invoiceOverdueThresholdIso, maxItems, refreshIndex, supabaseClient]);

  const retry = () => setRefreshIndex((value) => value + 1);

  if (status === "error") {
    return (
      <div className="rounded border border-slate-800 px-3 py-3 text-sm text-slate-300">
        <p className="text-sm text-slate-200">{errorMessage || "Unable to load invoices right now."}</p>
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
    return <p className="hb-muted text-xs">No overdue invoices.</p>;
  }

  return (
    <div className="space-y-0 divide-y divide-slate-800/70">
      {items.map((item) => (
        <AttentionListRow key={item.id} item={item} />
      ))}
    </div>
  );
}
