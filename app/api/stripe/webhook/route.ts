import { NextResponse } from "next/server";
import Stripe from "stripe";

import { createAdminClient } from "@/utils/supabase/admin";
import { ensureInvoiceForQuote } from "@/utils/invoices/ensureInvoiceForQuote";
import { sendReceiptEmail } from "@/utils/email/sendReceiptEmail";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Handled events & actions:
// - checkout.session.completed: triggered when a Payment Link checkout succeeds.
//   We find the quote via metadata, mark it paid in public.quotes, then insert a
//   row into public.quote_payments for reporting/audit. RLS is bypassed here via
//   the service-role client. Public access is only via tokenized quote/invoice
//   pages in `app/public/...`.
export const runtime = "nodejs";

export async function POST(req: Request) {
  // Testing tips:
  // 1. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook` while
  //    `npm run dev` is up; Stripe CLI opens a tunnel and sets STRIPE_WEBHOOK_SECRET.
  // 2. In the Stripe Dashboard (Developers > Webhooks) point your dev endpoint to
  //    the CLI’s forwarding URL and prod to https://your-domain.com/api/stripe/webhook.
  // 3. Trigger `checkout.session.completed` by creating a Payment Link in test mode
  //    and completing checkout via the Dashboard or `stripe payment_links create`
  //    + `stripe checkout sessions create` CLI commands.
  if (!stripe || !webhookSecret) {
    console.warn("[stripe-webhook] Missing Stripe configuration.");
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log("[stripe-webhook] Received event:", event.type);

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event, supabase);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  supabase: ReturnType<typeof createAdminClient>
) {
  // Payment Links ultimately create Checkout Sessions, and Stripe guarantees
  // checkout.session.completed fires once the customer pays successfully.
  if (!event.data.object || typeof event.data.object !== "object") {
    console.warn("[stripe-webhook] checkout.session.completed missing session payload");
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const quoteId = session.metadata?.quote_id;

  if (!quoteId) {
    console.warn("[stripe-webhook] checkout.session.completed missing quote_id metadata");
    return;
  }

  console.log("[stripe-webhook] Found quote_id in metadata:", quoteId);

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const paidAt =
    typeof event.created === "number"
      ? new Date(event.created * 1000).toISOString()
      : new Date().toISOString();

  const { data: quote, error: fetchError } = await supabase
    .from("quotes")
    .select("id, status, user_id")
    .eq("id", quoteId)
    .maybeSingle();

  if (fetchError) {
    console.error("[stripe-webhook] Failed to load quote", quoteId, fetchError.message);
    return;
  }

  if (!quote) {
    console.warn("[stripe-webhook] No quote found for id", quoteId);
    return;
  }

  const updatePayload: Record<string, unknown> = {
    status: "paid",
    paid_at: paidAt,
    updated_at: new Date().toISOString(),
  };

  if (paymentIntentId) {
    updatePayload.stripe_payment_intent_id = paymentIntentId;
  }

  const { error: updateError } = await supabase
    .from("quotes")
    .update(updatePayload)
    .eq("id", quoteId);

  if (updateError) {
    console.error("[stripe-webhook] Failed to update quote", quoteId, updateError.message);
    return;
  }

  console.log("[stripe-webhook] Quote marked paid", quoteId);

  const amountTotal = session.amount_total ?? null;
  const currency = session.currency ?? null;

  if (!amountTotal || !currency) {
    console.warn("[stripe-webhook] Missing amount/currency on session", session.id);
    return;
  }

  const paymentRecord = {
    quote_id: quoteId,
    user_id: quote.user_id,
    amount: amountTotal / 100,
    currency: currency.toUpperCase(),
    stripe_payment_intent_id: paymentIntentId,
    stripe_checkout_session_id: session.id,
    stripe_payment_link_id:
      typeof session.payment_link === "string"
        ? session.payment_link
        : session.payment_link?.id ?? null,
    stripe_event_id: event.id,
    customer_email: session.customer_details?.email ?? null,
  };

  const { error: insertError } = await supabase.from("quote_payments").insert(paymentRecord);

  if (insertError) {
    if (insertError.code === "23505") {
      console.log(
        "[stripe-webhook] quote_payments entry already exists for intent",
        paymentIntentId
      );
      return;
    }

    console.error("[stripe-webhook] Failed to insert quote payment", insertError.message);
    return;
  }

  console.log("[stripe-webhook] Recorded payment for quote", quoteId);

  // Ensure an invoice exists and is marked paid with Stripe metadata
  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id, status, public_token, invoice_number, customer_email")
    .eq("quote_id", quoteId)
    .maybeSingle();

  let invoiceForReceipt:
    | {
        id: string;
        public_token: string | null;
        invoice_number?: number | null;
        customer_email?: string | null;
      }
    | null = null;

  if (!existingInvoice) {
    invoiceForReceipt = await ensureInvoiceForQuote({
      supabase,
      quoteId,
      markPaid: true,
      paidAt,
      paymentIntentId,
    });
  } else {
    invoiceForReceipt = existingInvoice;

    if (existingInvoice.status !== "paid") {
      const { error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: paidAt,
          stripe_payment_intent_id: paymentIntentId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInvoice.id)
        .select("id, public_token, invoice_number, customer_email")
        .maybeSingle();

      if (invoiceUpdateError) {
        console.error(
          "[stripe-webhook] Failed to mark invoice paid",
          existingInvoice.id,
          invoiceUpdateError.message
        );
      }
    }
  }

  if (!invoiceForReceipt && quote.user_id) {
    // Fallback: fetch invoice to deliver a receipt if created earlier.
    const { data: invoiceRow } = await supabase
      .from("invoices")
      .select("id, public_token, invoice_number, customer_email")
      .eq("quote_id", quoteId)
      .maybeSingle();
    invoiceForReceipt = invoiceRow ?? null;
  }

  const receiptEmail = session.customer_details?.email || invoiceForReceipt?.customer_email;
  const invoiceToken = invoiceForReceipt?.public_token;

  if (receiptEmail && invoiceToken) {
    const publicInvoiceUrl = `${process.env.NEXT_PUBLIC_APP_URL}/public/invoices/${invoiceToken}`;
    await sendReceiptEmail({
      to: receiptEmail,
      amount: amountTotal / 100,
      invoiceNumber: invoiceForReceipt?.invoice_number ?? invoiceForReceipt?.id,
      publicUrl: publicInvoiceUrl,
    });
  }
}
