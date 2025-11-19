// utils/email/sendQuoteEmail.ts
"use server";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type SendQuoteEmailArgs = {
  to: string;
  customerName: string;
  quoteTotal: number;
  clientMessage: string;
  publicUrl: string;
};


export async function sendQuoteEmail({
  to,
  customerName,
  quoteTotal,
  clientMessage,
  publicUrl,
}: SendQuoteEmailArgs) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping email send.");
    return;
  }

  
  const from = process.env.QUOTE_FROM_EMAIL || "HandyBob <no-reply@example.com>";


  await resend.emails.send({
    from,
    to,
    subject: `Your quote from HandyBob`,
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
        <p style="margin-top: 24px; font-size: 12px; color: #64748b;">
          Sent via HandyBob – full support office in an app.
        </p>
      </div>
    `,
  });
}
