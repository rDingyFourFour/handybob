import { NextResponse } from "next/server";
import Stripe from "stripe";

import { createAdminClient } from "@/utils/supabase/admin";
import { ensureInvoiceForQuote } from "@/utils/invoices/ensureInvoiceForQuote";
import { sendReceiptEmail } from "@/utils/email/sendReceiptEmail";
import { logAuditEvent } from "@/utils/audit/log";
import { publicInvoiceUrl } from "@/utils/urls/public";

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

// Webhook receiver: validates the Stripe signature, uses the service-role Supabase client, and dispatches supported events.
// Assumes `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are configured and Stripe will retry on 4xx/5xx responses.
// Returns `{"received": true}` on success or a friendly error payload when validation fails.
export async function POST(req: Request) {
  // Testing tips:
  // 1. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook` while
  //    `npm run dev` is up; Stripe CLI opens a tunnel and sets STRIPE_WEBHOOK_SECRET.
  // 2. In the Stripe Dashboard (Developers > Webhooks) point your dev endpoint to
  //    the CLI’s forwarding URL and prod to https://your-domain.com/api/stripe/webhook.
  // 3. Trigger `checkout.session.completed` by creating a Payment Link in test mode
  //    and completing checkout via the Dashboard or `stripe payment_links create`
  //    + `stripe checkout sessions create` CLI commands.
  // Stripe test checklist (dev/test mode):
  // - CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook` to set STRIPE_WEBHOOK_SECRET.
  // - Create a Payment Link in test mode (Dashboard or `stripe payment_links create ...`), then complete checkout with test card 4242...
  // - Expect DB: quote.status=paid, quote.paid_at set, quote_payments row inserted (amount/currency/intent/session/link ids), invoice created or updated to paid with stripe_payment_intent_id, audit events logged, receipt email attempted if a customer email exists.
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

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event, supabase);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    console.error("[stripe-webhook] Failed to process event:", message);
    return NextResponse.json(
      { error: "Failed to process Stripe event" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

// Processes Stripe checkout.session.completed events: marks the quote/invoice paid, inserts the payment record, and attempts receipt delivery.
// Assumes the Stripe signature has already been validated and the service-role Supabase client is available for workspace-scoped writes.
// Returns silently after logging if any step cannot complete so Stripe can retry later.
async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  supabase: ReturnType<typeof createAdminClient>
) {
  // Payment Links ultimately create Checkout Sessions, and Stripe guarantees
  // checkout.session.completed fires once the customer pays successfully.
  // Happy path: verify signature, find quote, mark quote paid, ensure invoice exists, and mark invoice paid with the same workspace/job linkage.
  // Failure modes: missing metadata, DB errors, or download issues are logged and exit early without throwing to Stripe.
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
    .select("id, status, user_id, workspace_id")
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

  if (!quote.workspace_id) {
    console.warn("[stripe-webhook] Quote lacks workspace_id; aborting", quoteId);
    return;
  }

  const quoteWorkspaceId = quote.workspace_id;

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
    .eq("id", quoteId)
    .eq("workspace_id", quoteWorkspaceId);

  if (updateError) {
    console.error("[stripe-webhook] Failed to update quote", quoteId, updateError.message);
    return;
  }

  console.log("[stripe-webhook] Quote marked paid", quoteId);

  // Audit: quote paid (system actor via webhook)
  await logAuditEvent({
    supabase,
    workspaceId: quote.workspace_id,
    actorUserId: null,
    action: "quote_paid",
    entityType: "quote",
    entityId: quoteId,
    metadata: { payment_intent: paymentIntentId },
  });

  const amountTotal = session.amount_total ?? null;
  const currency = session.currency ?? null;

  if (!amountTotal || !currency) {
    console.warn("[stripe-webhook] Missing amount/currency on session", session.id);
    return;
  }

  const paymentRecord = {
    quote_id: quoteId,
    user_id: quote.user_id,
    workspace_id: quote.workspace_id,
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
        .eq("workspace_id", quote.workspace_id ?? undefined)
        .select("id, public_token, invoice_number, customer_email")
        .maybeSingle();

      if (invoiceUpdateError) {
        console.error(
          "[stripe-webhook] Failed to mark invoice paid",
          existingInvoice.id,
          invoiceUpdateError.message
        );
      } else {
        await logAuditEvent({
          supabase,
          workspaceId: quote.workspace_id,
          actorUserId: null,
          action: "invoice_paid",
          entityType: "invoice",
          entityId: existingInvoice.id,
          metadata: { payment_intent: paymentIntentId, amount: amountTotal / 100, currency: currency.toUpperCase() },
        });
      }
    }
  }

  if (!invoiceForReceipt && quote.user_id) {
    // Fallback: fetch invoice to deliver a receipt if created earlier.
    const { data: invoiceRow } = await supabase
      .from("invoices")
      .select("id, public_token, invoice_number, customer_email")
      .eq("quote_id", quoteId)
      .eq("workspace_id", quote.workspace_id ?? undefined)
      .maybeSingle();
    invoiceForReceipt = invoiceRow ?? null;
  }

  const receiptEmail = session.customer_details?.email || invoiceForReceipt?.customer_email;
  const invoiceToken = invoiceForReceipt?.public_token;

  if (receiptEmail && invoiceToken) {
    const publicInvoiceLink = publicInvoiceUrl(invoiceToken);
    await sendReceiptEmail({
      to: receiptEmail,
      amount: amountTotal / 100,
      invoiceNumber: invoiceForReceipt?.invoice_number ?? invoiceForReceipt?.id,
      publicUrl: publicInvoiceLink,
    });
  }
}
