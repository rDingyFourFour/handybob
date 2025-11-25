// utils/payments/createPaymentLink.ts
"use server";

import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/utils/supabase/server";
import { logAuditEvent } from "@/utils/audit/log";
import { publicInvoiceUrl } from "@/utils/urls/public";
import { sendReceiptEmail } from "@/utils/email/sendReceiptEmail";
import { ensureInvoiceForQuote } from "@/lib/domain/invoices";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY is not set; Stripe payments disabled.");
}

// Server-only Stripe helper:
// - Uses secret key only on the server (no client-side Stripe usage).
// - Creates a Payment Link with quote/workspace/user metadata for webhook reconciliation.
// - Throws if Stripe is not configured so the caller can surface an error.
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      // Use your account's default API version (configured in Stripe dashboard)  [oai_citation:6‡Stripe Docs](https://docs.stripe.com/api/versioning?utm_source=chatgpt.com)
    })
  : null;

// Server action hit from the quote detail page to spin up a Stripe Payment Link
// for the contractor so they can share a Pay button with their customer.
export async function createPaymentLinkForQuote(formData: FormData) {
  const quoteId = String(formData.get("quote_id"));

  const supabase = await createServerClient();
  const { user, workspace } = await getCurrentWorkspace({ supabase });

  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  // Load quote with job + customer
  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      `
      *,
      jobs (
        title,
        customers (name, email)
      )
    `
    )
    .eq("id", quoteId)
    .eq("workspace_id", workspace.id)
    .single();

  if (error || !quote) {
    throw new Error("Quote not found");
  }

  // Amount in cents
  const amount = Math.round(quote.total * 100);

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: quote.jobs?.title || "HandyBob job",
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    // Optional: collect customer name/email, supported in recent Payment Links versions  [oai_citation:7‡Stripe Docs](https://docs.stripe.com/changelog/clover/2025-10-29/payment-links-name-collection?utm_source=chatgpt.com)
    metadata: {
      // Include quote + user identifiers so webhook handlers can reconcile
      // payments back to the right Supabase rows.
      quote_id: quote.id,
      user_id: user.id,
      workspace_id: workspace.id,
    },
  });

  await supabase
    .from("quotes")
    .update({
      // Store the Payment Link URL so the contractor dashboard and the public
      // quote page can show the same Pay button.
      stripe_payment_link_url: paymentLink.url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quote.id)
    .eq("workspace_id", workspace.id);

  return paymentLink.url;
}

export type StripeWebhookEvent =
  | {
      type: "checkout.session.completed";
      payload: {
        session: Stripe.Checkout.Session;
        eventId: string;
        paidAt: string;
      };
    }
  | {
      type: string;
      payload: unknown;
    };

export async function handleStripeEvent({
  supabase,
  event,
}: {
  supabase: SupabaseClient;
  event: StripeWebhookEvent;
}) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(supabase, event.payload);
      break;
    default:
      console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
  }
}

async function handleCheckoutSessionCompleted(
  supabase: SupabaseClient,
  payload: {
    session: Stripe.Checkout.Session;
    eventId: string;
    paidAt: string;
  }
) {
  const session = payload.session;
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

  const paidAt = payload.paidAt;

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
    stripe_event_id: payload.eventId,
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
