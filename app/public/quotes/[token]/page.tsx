// app/public/quotes/[token]/page.tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";

export default async function PublicQuotePage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createAdminClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      `
      *,
      jobs (
        title,
        customers (
          name,
          email,
          phone
        )
      )
    `
    )
    .eq("public_token", params.token)
    .single();

  if (!quote) {
    return notFound();
  }

  if (quote.public_expires_at && new Date(quote.public_expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="hb-card max-w-xl text-center space-y-2">
          <h1>This quote has expired</h1>
          <p className="hb-muted">
            Please contact your contractor to receive an updated quote.
          </p>
        </div>
      </div>
    );
  }

  const customer = quote.jobs?.customers;
  const canPay = Boolean(quote.stripe_payment_link_url);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
      <div className="hb-card max-w-xl w-full space-y-4">
        <div>
          <h1>Quote</h1>
          <p className="hb-muted">
            From: HandyBob contractor
          </p>
          <p className="hb-muted">
            For: {customer?.name || "Customer"}
          </p>
        </div>

        <div className="space-y-2">
          <h3>Job</h3>
          <p className="text-sm text-slate-200">
            {quote.jobs?.title || "Handyman work"}
          </p>
          <p className="hb-muted">
            {quote.line_items?.[0]?.scope || quote.client_message_template}
          </p>
        </div>

        <div className="space-y-1">
          <h3>Total</h3>
          <p className="text-2xl font-semibold">
            ${quote.total.toFixed(2)}
          </p>
        </div>

        {canPay ? (
          <a
            href={quote.stripe_payment_link_url as string}
            className="hb-button w-full text-center"
            target="_blank"
            rel="noreferrer"
          >
            Pay now
          </a>
        ) : (
          <p className="hb-muted text-xs">
            Online payment is not set up for this quote yet. Please contact your
            contractor directly.
          </p>
        )}

        <p className="hb-muted text-[10px] text-center">
          Powered by HandyBob – full support office in an app.
        </p>
      </div>
    </div>
  );
}