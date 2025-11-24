// utils/payments/createPaymentLink.ts
"use server";

import Stripe from "stripe";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";

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
