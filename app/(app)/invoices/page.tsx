export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { formatCurrency } from "@/utils/timeline/formatters";
import HbCard from "@/components/ui/hb-card";

type InvoiceRow = {
  id: string;
  user_id: string;
  job_id: string | null;
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
      .select("id, user_id, job_id, status, total, created_at, due_at, paid_at, public_token")
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
      </header>

      {invoicesError ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">Something went wrong</h2>
          <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        </HbCard>
      ) : invoices.length === 0 ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">No invoices yet</h2>
          <p className="hb-muted text-sm">There&apos;s nothing to show here yet.</p>
          <Link
            href="/quotes"
            className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
          >
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
              const totalLabel = invoice.total != null ? formatCurrency(invoice.total) : "—";
              const dateLabel = formatDate(invoice.due_at ?? invoice.created_at);
              const statusLabel = invoice.status ?? "draft";
              const shortInvoiceId = shortId(invoice.id);
              return (
                <article
                  key={invoice.id}
                  className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 transition hover:border-slate-600"
                >
                  <div className="flex flex-col gap-3 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-100">Invoice {shortInvoiceId}</p>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status: {statusLabel}</p>
                      {invoice.job_id ? (
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                          Job:{" "}
                          <Link
                            href={`/jobs/${invoice.job_id}`}
                            className="text-xs uppercase tracking-[0.3em] text-sky-300 hover:text-sky-200"
                          >
                            View job
                          </Link>
                        </p>
                      ) : (
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job: N/A</p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-slate-100">{totalLabel}</p>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Total:</p>
                    </div>
                    <div className="text-right space-y-1 text-[11px] uppercase tracking-[0.3em]">
                      <p className="text-slate-100">{dateLabel}</p>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Due</p>
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="text-xs uppercase tracking-[0.3em] text-sky-300 hover:text-sky-200"
                      >
                        View invoice
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </HbCard>
      )}
    </div>
  );
}
