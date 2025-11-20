// app/quotes/[id]/page.tsx
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { sendQuoteEmail } from "@/utils/email/sendQuoteEmail";
import { sendQuoteSms } from "@/utils/sms/sendQuoteSms";
import { createServerClient } from "@/utils/supabase/server";
import { createPaymentLinkForQuote } from "@/utils/payments/createPaymentLink";
import { ensureInvoiceForQuote } from "@/utils/invoices/ensureInvoiceForQuote";
import { logMessage } from "@/utils/communications/logMessage";


type CustomerInfo = {
  id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type JobWithCustomer = {
  id: string | null;
  customer_id?: string | null;
  title: string | null;
  customers: CustomerInfo | CustomerInfo[] | null;
};

type QuotePayment = {
  id: string;
  quote_id: string;
  user_id: string | null;
  amount: number;
  currency: string | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_link_id: string | null;
  stripe_event_id: string | null;
  customer_email: string | null;
  created_at: string;
};

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation ?? null;
}

// --- SERVER ACTIONS ---

async function sendQuoteEmailAction(formData: FormData) {
  "use server";

  const quoteId = String(formData.get("quote_id"));
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quote } = await supabase
    .from("quotes")
    .select(`
      *,
      jobs (
        id,
        title,
        customer_id,
        customers (
          id,
          name,
          email,
          phone
        )
      )
    `)
    .eq("id", quoteId)
    .single();

  if (!quote) {
    console.warn("Quote not found.");
    return;
  }

  const job = normalizeSingle<JobWithCustomer>(
    (quote.jobs as JobWithCustomer | JobWithCustomer[] | null) ?? null,
  );
  const customer = normalizeSingle<CustomerInfo>(job?.customers);

  if (!customer?.email) {
    console.warn("No email available for this quote.");
    return;
  }

  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/public/quotes/${quote.public_token}`;
  const quoteTotal = Number(quote.total ?? 0);

  await sendQuoteEmail({
    to: customer.email,
    customerName: customer.name || "",
    quoteTotal,
    clientMessage: quote.client_message_template || "...",
    publicUrl,
  });

  await logMessage({
    supabase,
    userId: user.id,
    customerId: customer.id,
    jobId: job?.id ?? quote.job_id ?? null,
    channel: "email",
    subject: "Quote sent",
    body: quote.client_message_template || `Quote total $${quoteTotal.toFixed(2)}`,
  });

  // Mark as sent if still draft
  if (quote.status === "draft") {
    await supabase
      .from("quotes")
      .update({
        status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", quote.id);
  }

  redirect(`/quotes/${quote.id}`);
}

async function sendQuoteSmsAction(formData: FormData) {
  "use server";

  const quoteId = String(formData.get("quote_id"));
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quote } = await supabase
    .from("quotes")
    .select(`
      *,
      jobs (
        id,
        title,
        customer_id,
        customers (
          id,
          name,
          phone
        )
      )
    `)
    .eq("id", quoteId)
    .single();

  if (!quote) {
    console.warn("Quote not found.");
    return;
  }

  const job = normalizeSingle<JobWithCustomer>(
    (quote.jobs as JobWithCustomer | JobWithCustomer[] | null) ?? null,
  );
  const customer = normalizeSingle<CustomerInfo>(job?.customers);

  if (!customer?.phone) {
    console.warn("No phone number available for this quote.");
    return;
  }

  const smsBody = `Hi ${customer.name || ""}, your quote total is $${Number(
    quote.total ?? 0
  ).toFixed(2)}.`;

  await sendQuoteSms({
    to: customer.phone,
    customerName: customer.name || "",
    quoteTotal: Number(quote.total ?? 0),
  });

  await logMessage({
    supabase,
    userId: user.id,
    customerId: customer.id,
    jobId: job?.id ?? quote.job_id ?? null,
    channel: "sms",
    body: smsBody,
  });

  if (quote.status === "draft") {
    await supabase
      .from("quotes")
      .update({
        status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", quote.id);
  }

  redirect(`/quotes/${quote.id}`);
}

async function acceptQuoteAction(formData: FormData) {
  "use server";

  const quoteId = String(formData.get("quote_id"));
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("quotes")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId);

  await ensureInvoiceForQuote({
    supabase,
    quoteId,
  });

  redirect(`/quotes/${quoteId}`);
}

async function createPaymentLinkAction(formData: FormData) {
  "use server";

  const quoteId = String(formData.get("quote_id"));
  await createPaymentLinkForQuote(formData);
  revalidatePath(`/quotes/${quoteId}`);
}

// --- PAGE COMPONENT ---

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [quoteRes, paymentsRes] = await Promise.all([
    supabase
      .from("quotes")
      .select(`
        *,
        jobs (
          title,
          customers (
            name,
            email,
            phone
          )
        )
      `)
      .eq("id", id)
      .single(),
    supabase
      .from("quote_payments")
      .select("*")
      .eq("quote_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const quote = quoteRes.data;
  // The query above pulls every quote column (including stripe_payment_link_url)
  // so the contractor-facing detail page has the Payment Link handy to copy or
  // resend once it has been generated.

  if (!quote) redirect("/jobs");

  const quotePayments = (paymentsRes.data ?? []) as QuotePayment[];

  const job = normalizeSingle<JobWithCustomer>(
    (quote.jobs as JobWithCustomer | JobWithCustomer[] | null) ?? null,
  );
  const customer = normalizeSingle<CustomerInfo>(job?.customers);

  const subtotal = Number(quote.subtotal ?? 0);
  const tax = Number(quote.tax ?? 0);
  const total = Number(quote.total ?? 0);
  const isPaid = quote.status === "paid";
  const paidAtLabel = quote.paid_at
    ? new Date(quote.paid_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-4">
      <div className="hb-card space-y-1">
        <h1>Quote</h1>
        <p className="hb-muted">
          Job: {job?.title || "Untitled job"}
        </p>
        <p className="hb-muted">
          Customer: {customer?.name || "Unknown"}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Status:</span>
          <span className={isPaid ? "text-emerald-400" : ""}>
            {quote.status}
          </span>
        </div>
        {isPaid && paidAtLabel && (
          <p className="hb-muted text-xs">
            Paid on {paidAtLabel}
          </p>
        )}
      </div>

      <div className="hb-card space-y-2">
        <h3>Scope of work</h3>
        <p>{quote.line_items?.[0]?.scope || "No scope available."}</p>
      </div>

      <div className="hb-card space-y-2">
        <h3>Totals</h3>
        <p>Subtotal: ${subtotal.toFixed(2)}</p>
        <p>Tax: ${tax.toFixed(2)}</p>
        <p className="font-semibold">Total: ${total.toFixed(2)}</p>
      </div>

      <div className="hb-card space-y-2">
        <h3>Client message</h3>
        <p className="text-sm">
          {quote.client_message_template ||
            "Here is your quote. Let me know if this works for you."}
        </p>
      </div>

      <div className="hb-card space-y-3">
        <div className="flex items-center justify-between">
          <h3>Payment</h3>
          {paidAtLabel && isPaid && (
            <span className="text-xs text-emerald-400">
              Paid on {paidAtLabel}
            </span>
          )}
        </div>
        {quote.stripe_payment_link_url ? (
          <a
            href={quote.stripe_payment_link_url as string}
            className="hb-button-ghost text-sm"
            target="_blank"
            rel="noreferrer"
          >
            View payment link
          </a>
        ) : (
          <p className="hb-muted text-sm">
            No payment link generated yet.
          </p>
        )}
        <form action={createPaymentLinkAction}>
          <input type="hidden" name="quote_id" value={quote.id} />
          <button
            type="submit"
            className="hb-button"
            disabled={isPaid}
          >
            Generate Stripe payment link
          </button>
        </form>
        {isPaid && (
          <p className="hb-muted text-xs">
            Quote is paid — payments and sends are disabled.
          </p>
        )}
      </div>

      <div className="hb-card space-y-3">
        <h3>Send to customer</h3>
        <div className="flex flex-wrap gap-2">
          <form action={sendQuoteEmailAction}>
            <input type="hidden" name="quote_id" value={quote.id} />
            <button type="submit" className="hb-button" disabled={isPaid}>
              Send via email
            </button>
          </form>

          <form action={sendQuoteSmsAction}>
            <input type="hidden" name="quote_id" value={quote.id} />
            <button type="submit" className="hb-button-ghost" disabled={isPaid}>
              Send via SMS
            </button>
          </form>
        </div>

        <p className="hb-muted text-xs">
          Email uses the client message above. SMS sends a short summary & total.
        </p>
        {isPaid && (
          <p className="hb-muted text-xs">
            Quote is paid — sending options are disabled.
          </p>
        )}
      </div>

      <div className="hb-card space-y-2">
        <h3>Payment history</h3>
        {quotePayments.length === 0 ? (
          <p className="hb-muted text-sm">
            No payments recorded for this quote yet.
          </p>
        ) : (
          <div className="space-y-2">
            {quotePayments.map((payment) => {
              const createdAt = new Date(payment.created_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <div
                  key={payment.id}
                  className="rounded border border-slate-800 px-3 py-2 text-sm"
                >
                  <div className="flex justify-between">
                    <span className="font-semibold">
                      ${payment.amount.toFixed(2)} {payment.currency?.toUpperCase() || "USD"}
                    </span>
                    <span className="hb-muted text-xs">
                      {createdAt}
                    </span>
                  </div>
                  {payment.stripe_payment_intent_id && (
                    <p className="hb-muted text-xs">
                      Intent: {payment.stripe_payment_intent_id}
                    </p>
                  )}
                  {payment.customer_email && (
                    <p className="hb-muted text-xs">
                      Customer: {payment.customer_email}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        {quote.status !== "accepted" && (
          <form action={acceptQuoteAction}>
            <input type="hidden" name="quote_id" value={quote.id} />
            <button type="submit" className="hb-button">
              Mark as accepted
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
