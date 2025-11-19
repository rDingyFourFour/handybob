// app/public/invoices/[token]/page.tsx
import { notFound } from "next/navigation";

import { createAdminClient } from "@/utils/supabase/admin";

export default async function PublicInvoicePage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createAdminClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `
        *,
        quotes (
          id,
          stripe_payment_link_url,
          jobs (
            title
          )
        )
      `
    )
    .eq("public_token", params.token)
    .single();

  if (!invoice) {
    return notFound();
  }

  const jobTitle = invoice.quotes?.jobs
    ? Array.isArray(invoice.quotes.jobs)
      ? invoice.quotes.jobs[0]?.title
      : invoice.quotes.jobs.title
    : null;

  const payUrl =
    invoice.status !== "paid"
      ? invoice.stripe_payment_link_url || invoice.quotes?.stripe_payment_link_url
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
      <div className="hb-card max-w-xl w-full space-y-4">
        <div>
          <h1>Invoice</h1>
          <p className="hb-muted">
            From: HandyBob contractor
          </p>
          <p className="hb-muted">
            Job: {jobTitle || "Handyman work"}
          </p>
        </div>

        <div className="space-y-1">
          <h3>Total</h3>
          <p className="text-2xl font-semibold">
            ${Number(invoice.total ?? 0).toFixed(2)}
          </p>
          <p className="hb-muted text-sm">
            Status: {invoice.status}
          </p>
          {invoice.due_at && (
            <p className="hb-muted text-sm">
              Due {new Date(invoice.due_at).toLocaleDateString()}
            </p>
          )}
        </div>

        {payUrl ? (
          <a
            href={payUrl as string}
            className="hb-button w-full text-center"
            target="_blank"
            rel="noreferrer"
          >
            Pay now
          </a>
        ) : (
          <p className="hb-muted text-xs">
            Payment is complete or not available online. Contact your contractor if you have questions.
          </p>
        )}

        <p className="hb-muted text-[10px] text-center">
          Powered by HandyBob – full support office in an app.
        </p>
      </div>
    </div>
  );
}
