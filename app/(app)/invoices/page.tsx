import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatCurrency } from "@/utils/timeline/formatters";

type InvoiceRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  due_at: string | null;
  job?: {
    title: string | null;
    customers?: { name: string | null }[] | null;
  } | null;
};

const ERROR_MESSAGE = "Unable to load invoices right now. Please try again.";

export default async function InvoicesPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoices] Failed to initialize Supabase client:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load invoices</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[invoices] Failed to resolve the user:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load invoices</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    redirect("/login");
  }

  let workspaceContext;
  try {
    workspaceContext = await getCurrentWorkspace({ supabase });
  } catch (error) {
    console.error("[invoices] Failed to resolve workspace:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load invoices</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  const { workspace } = workspaceContext;

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("id, status, total, created_at, due_at, job:jobs(title, customers(name))")
    .eq("workspace_id", workspace.id)
    .order("due_at", { ascending: false, nulls: "last" })
    .limit(50);

  if (error) {
    console.error("[invoices] failed to load invoices", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load invoices</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  const invoiceList = (invoices ?? []) as InvoiceRow[];

  if (invoiceList.length === 0) {
    return (
      <div className="hb-shell pt-20 pb-8 space-y-4">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Invoices</h1>
          <p className="text-sm text-slate-400">No invoices found yet.</p>
        </header>
        <Link href="/quotes/new" className="hb-button">
          Create a quote
        </Link>
      </div>
    );
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Invoices</h1>
        <Link href="/quotes/new" className="hb-button">
          New quote
        </Link>
      </header>
      <div className="space-y-3">
        {invoiceList.map((invoice) => {
          const label = invoice.job?.title
            ? `Invoice for ${invoice.job.title}`
            : `Invoice #${invoice.id.slice(0, 8)}`;
          const dueLabel = invoice.due_at
            ? new Date(invoice.due_at).toLocaleDateString()
            : invoice.created_at
            ? new Date(invoice.created_at).toLocaleDateString()
            : "—";
          const totalLabel = invoice.total != null ? formatCurrency(invoice.total) : "—";
          const rawCustomers = invoice.job?.customers;
          const customersArray = Array.isArray(rawCustomers)
            ? rawCustomers
            : rawCustomers
            ? [rawCustomers]
            : [];
          const customerNames =
            customersArray
              .map((customer) => customer?.name)
              .filter((name): name is string => !!name) ?? [];
          const customerLabel = customerNames.length > 0 ? customerNames.join(", ") : null;
          return (
            <div key={invoice.id} className="hb-card space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="hb-card-heading">{label}</p>
                  <p className="text-xs text-slate-400 capitalize">
                    Status: {invoice.status ?? "Unknown"} · Due {dueLabel}
                    {customerLabel ? ` · ${customerLabel}` : ""}
                  </p>
                </div>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="text-sm font-medium text-sky-400 hover:text-sky-300"
                >
                  View
                </Link>
              </div>
              <p className="text-sm font-semibold text-slate-100">{totalLabel}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
