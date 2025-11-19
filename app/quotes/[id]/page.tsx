// app/quotes/[id]/page.tsx
import { redirect } from "next/navigation";

import { sendQuoteEmail } from "@/utils/email/sendQuoteEmail";
import { sendQuoteSms } from "@/utils/sms/sendQuoteSms";
import { createServerClient } from "@/utils/supabase/server";
// import { createPaymentLinkForQuote } from "@/utils/payments/createPaymentLink";


type CustomerInfo = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

type JobWithCustomer = {
  title: string | null;
  customers: CustomerInfo | CustomerInfo[] | null;
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
        title,
        customers (
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

  // const baseAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    ///\/$/,
    //"",
//  );
  // const publicUrl = quote.public_token
  //   ? `${baseAppUrl}/public/quotes/${quote.public_token}`
  //   : `${baseAppUrl}/quotes`;
  // const quoteTotal = Number(quote.total ?? 0);

  // const publicUrl = quote.public_token
  // ? `${base}/public/quotes/${quote.public_token}`
  // : `${base}/quotes`;

  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/public/quotes/${quote.public_token}`;

  await sendQuoteEmail({
    to: quote.jobs.customers.email,
    customerName: quote.jobs.customers.name,
    quoteTotal: quote.total,
    clientMessage: quote.client_message_template || "...",
    publicUrl,
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
        title,
        customers (
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

  await sendQuoteSms({
    to: customer.phone,
    customerName: customer.name || "",
    quoteTotal: Number(quote.total ?? 0),
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

  redirect(`/quotes/${quoteId}`);
}

// --- PAGE COMPONENT ---

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quote } = await supabase
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
    .single();

  if (!quote) redirect("/jobs");

  const job = normalizeSingle<JobWithCustomer>(
    (quote.jobs as JobWithCustomer | JobWithCustomer[] | null) ?? null,
  );
  const customer = normalizeSingle<CustomerInfo>(job?.customers);

  const subtotal = Number(quote.subtotal ?? 0);
  const tax = Number(quote.tax ?? 0);
  const total = Number(quote.total ?? 0);

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
        <p className="hb-muted">
          Status: {quote.status}
        </p>
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
        <h3>Send to customer</h3>
        <div className="flex flex-wrap gap-2">
          <form action={sendQuoteEmailAction}>
            <input type="hidden" name="quote_id" value={quote.id} />
            <button type="submit" className="hb-button">
              Send via email
            </button>
          </form>

          <form action={sendQuoteSmsAction}>
            <input type="hidden" name="quote_id" value={quote.id} />
            <button type="submit" className="hb-button-ghost">
              Send via SMS
            </button>
          </form>
        </div>

        <p className="hb-muted text-xs">
          Email uses the client message above. SMS sends a short summary & total.
        </p>
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
