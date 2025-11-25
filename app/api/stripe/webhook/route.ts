// Stripe webhook: validates `checkout.session.completed` signatures and forwards normalized events to `handleStripeEvent`.
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { createAdminClient } from "@/utils/supabase/admin";
import { handleStripeEvent, type StripeWebhookEvent } from "@/lib/domain/payments";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export const runtime = "nodejs";

export async function POST(req: Request) {
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

  const formattedEvent = normalizeStripeEvent(event);
  if (!formattedEvent) {
    console.warn("[stripe-webhook] Unable to normalize event payload for", event.type);
    return NextResponse.json({ error: "Unhandled Stripe event" }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    await handleStripeEvent({ supabase, event: formattedEvent });
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

function normalizeStripeEvent(event: Stripe.Event): StripeWebhookEvent | null {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (!session || typeof session !== "object") {
      return null;
    }

    return {
      type: "checkout.session.completed",
      payload: {
        session: session as Stripe.Checkout.Session,
        eventId: event.id,
        paidAt:
          typeof event.created === "number"
            ? new Date(event.created * 1000).toISOString()
            : new Date().toISOString(),
      },
    };
  }

  return { type: event.type, payload: event };
}
