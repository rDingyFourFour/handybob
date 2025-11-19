import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

type InvoiceListItem = {
  id: string;
  invoice_number: number | null;
  status: string | null;
  total: number | null;
  due_at: string | null;
  issued_at: string | null;
};

export default async function InvoicesPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, due_at, issued_at")
    .order("issued_at", { ascending: false });

  const safeInvoices = (invoices ?? []) as InvoiceListItem[];
  const loadError = error?.message;

  return (
    <div className="space-y-6">
      <div className="hb-card space-y-1">
        <h1>Invoices</h1>
        <p className="hb-muted">
          Automatically created from quotes and ready to send.
        </p>
      </div>

      <div className="hb-card space-y-4">
        {loadError ? (
          <p className="text-sm text-red-400">
            Failed to load invoices: {loadError}
          </p>
        ) : safeInvoices.length ? (
          safeInvoices.map((invoice) => {
            const dueDate = invoice.due_at
              ? new Date(invoice.due_at).toLocaleDateString()
              : "No due date";
            const issuedDate = invoice.issued_at
              ? new Date(invoice.issued_at).toLocaleDateString()
              : "—";

            return (
              <div
                key={invoice.id}
                className="flex flex-col gap-4 rounded-xl border border-slate-800 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    Invoice #
                    {invoice.invoice_number ?? invoice.id.slice(0, 8)} · {invoice.status}
                  </p>
                  <p className="hb-muted text-sm">
                    Issued {issuedDate} · Due {dueDate}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-semibold">
                    $
                    {Number(invoice.total ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <Link href={`/invoices/${invoice.id}`} className="hb-button">
                    View invoice
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <p className="hb-muted text-sm">
            No invoices yet. Accept a quote or mark it paid to generate one automatically.
          </p>
        )}
      </div>
    </div>
  );
}
