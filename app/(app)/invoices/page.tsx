export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { formatCurrency } from "@/utils/timeline/formatters";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type InvoiceRow = {
  id: string;
  user_id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  public_token?: string | null;
};

export default async function InvoicesPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoices] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[invoices] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let invoices: InvoiceRow[] = [];
  let invoicesError: unknown = null;

  try {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, user_id, status, total, created_at, due_at, paid_at, public_token")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false, nulls: "last" })
      .limit(50);
    if (error) {
      console.error("[invoices] Failed to load invoices:", error);
      invoicesError = error;
    } else {
      invoices = (data ?? []) as InvoiceRow[];
    }
  } catch (error) {
    console.error("[invoices] Failed to load invoices:", error);
    invoicesError = error;
  }

  function formatDate(value: string | null) {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  const shortId = (value: string) => value.slice(0, 8);

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoices</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Invoices</h1>
          <p className="hb-muted text-sm">
            Track what’s due, what’s paid, and what needs your attention.
          </p>
        </div>
        <HbButton as={Link} href="/invoices/new" size="sm" variant="secondary">
          New invoice
        </HbButton>
      </header>

      {invoicesError ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">Unable to load invoices</h2>
          <p className="hb-muted text-sm">
            Something went wrong while loading your invoices. Please try again.
          </p>
        </HbCard>
      ) : invoices.length === 0 ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">No invoices yet</h2>
          <p className="hb-muted text-sm">
            Once you send invoices, they’ll show up here with their status and amounts.
          </p>
          <Link href="/quotes" className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100">
            → Create a quote first
          </Link>
        </HbCard>
      ) : (
        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="hb-card-heading text-lg font-semibold">All invoices</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Showing {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="space-y-2">
            {invoices.map((invoice) => {
              const totalLabel =
                invoice.total != null ? formatCurrency(invoice.total) : "Amount not set";
              const createdLabel = formatDate(invoice.created_at);
              const dueLabel = formatDate(invoice.due_at);
              const paidLabel = formatDate(invoice.paid_at);
              return (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="group block rounded-2xl px-4 py-3 transition hover:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-100">
                        Invoice {shortId(invoice.id)}
                      </p>
                      <p className="text-sm text-slate-400">
                        Status: {invoice.status ?? "draft"}
                      </p>
                      <p className="text-sm text-slate-400">{totalLabel}</p>
                      <p className="text-xs text-slate-500">
                        Created: {createdLabel} · Due: {dueLabel}
                      </p>
                      {invoice.paid_at && (
                        <p className="text-xs text-slate-500">
                          Paid: {paidLabel}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      <span>View</span>
                      {invoice.public_token && (
                        <span>Public</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </HbCard>
      )}
    </div>
  );
}
