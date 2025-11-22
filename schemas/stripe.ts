import type Stripe from "stripe";

export type StripeCheckoutSessionPayload = {
  id: string;
  quote_id: string;
  amount_total: number;
  currency: string;
  payment_intent_id: string | null;
  payment_link_id: string | null;
  customer_email: string | null;
};

export function validateStripeCheckoutSession(
  session: Stripe.Checkout.Session,
): { success: true; data: StripeCheckoutSessionPayload } | { success: false; error: string } {
  const metadata = session.metadata ?? {};
  const quoteId = typeof metadata.quote_id === "string" ? metadata.quote_id.trim() : null;
  if (!quoteId) {
    return { success: false, error: "Session metadata missing quote_id." };
  }

  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;
  const currency = typeof session.currency === "string" ? session.currency.trim().toUpperCase() : null;
  if (!amountTotal || !currency) {
    return { success: false, error: "Session missing amount or currency." };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : typeof session.payment_intent === "object" && session.payment_intent?.id
        ? session.payment_intent.id
        : null;

  const paymentLinkId =
    typeof session.payment_link === "string"
      ? session.payment_link
      : typeof session.payment_link === "object" && session.payment_link?.id
        ? session.payment_link.id
        : null;

  const customerEmail =
    typeof session.customer_details?.email === "string"
      ? session.customer_details.email.trim() || null
      : null;

  if (!session.id) {
    return { success: false, error: "Session missing identifier." };
  }

  return {
    success: true,
    data: {
      id: session.id,
      quote_id: quoteId,
      amount_total: amountTotal,
      currency,
      payment_intent_id: paymentIntentId,
      payment_link_id: paymentLinkId,
      customer_email: customerEmail,
    },
  };
}
