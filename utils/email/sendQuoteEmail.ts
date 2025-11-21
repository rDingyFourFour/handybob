// utils/email/sendQuoteEmail.ts
"use server";

import { Resend } from "resend";

type SendQuoteEmailArgs = {
  to: string;
  customerName: string;
  quoteTotal: number;
  clientMessage: string;
  publicUrl: string;
  workspace?: {
    name?: string | null;
    brand_name?: string | null;
    brand_tagline?: string | null;
    business_email?: string | null;
    business_phone?: string | null;
    business_address?: string | null;
  };
};

let resendClient: Resend | null = null;

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

export async function sendQuoteEmail({
  to,
  customerName,
  quoteTotal,
  clientMessage,
  publicUrl,
  workspace,
}: SendQuoteEmailArgs) {
  const resend = getResendClient();
  if (!resend) {
    console.warn("RESEND_API_KEY not set; skipping email send.");
    return;
  }

  const from = process.env.QUOTE_FROM_EMAIL || "HandyBob <no-reply@example.com>";
  const brandName = workspace?.brand_name || workspace?.name || "HandyBob";
  const tagline = workspace?.brand_tagline;

  await resend.emails.send({
    from,
    to,
    subject: `Your quote from ${brandName}`,
    text: `${clientMessage}\n\nView your quote: ${publicUrl}`,
    html: `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px;">
        <h2>Hi ${customerName || ""},</h2>
        <p>${clientMessage}</p>
        <p style="margin-top: 16px;">
          <a href="${publicUrl}">View and pay your quote</a>
        </p>
        <p style="margin-top: 16px; font-weight: 600;">
          Total: $${quoteTotal.toFixed(2)}
        </p>
        <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #475569; line-height: 1.4;">
          <div style="font-weight: 600; color: #0f172a;">${brandName}</div>
          ${tagline ? `<div>${tagline}</div>` : ""}
          ${workspace?.business_email ? `<div>Email: ${workspace.business_email}</div>` : ""}
          ${workspace?.business_phone ? `<div>Phone: ${workspace.business_phone}</div>` : ""}
          ${workspace?.business_address ? `<div>${workspace.business_address}</div>` : ""}
        </div>
        <p style="margin-top: 12px; font-size: 11px; color: #94a3b8;">
          Sent via HandyBob – full support office in an app.
        </p>
      </div>
    `,
  });
}
