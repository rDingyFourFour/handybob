// utils/email/sendReceiptEmail.ts
"use server";

import { Resend } from "resend";

type SendReceiptEmailArgs = {
  to: string;
  amount: number;
  invoiceNumber?: number | string | null;
  publicUrl: string;
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

export async function sendReceiptEmail({
  to,
  amount,
  invoiceNumber,
  publicUrl,
}: SendReceiptEmailArgs) {
  const resend = getResendClient();
  if (!resend) {
    console.warn("RESEND_API_KEY not set; skipping receipt email send.");
    return;
  }

  const from = process.env.QUOTE_FROM_EMAIL || "HandyBob <no-reply@example.com>";

  const subject = invoiceNumber
    ? `Payment received for invoice #${invoiceNumber}`
    : "Payment received";

  await resend.emails.send({
    from,
    to,
    subject,
    text: `Thanks for your payment of $${amount.toFixed(2)}${
      invoiceNumber ? ` for invoice #${invoiceNumber}` : ""
    }. View your receipt: ${publicUrl}`,
    html: `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px;">
        <h2>Thank you!</h2>
        <p>We received your payment of <strong>$${amount.toFixed(2)}</strong>$${
          invoiceNumber ? ` for invoice #${invoiceNumber}` : ""
        }.</p>
        <p style="margin-top: 16px;">
          <a href="${publicUrl}">View your receipt</a>
        </p>
        <p style="margin-top: 24px; font-size: 12px; color: #64748b;">
          Powered by HandyBob – full support office in an app.
        </p>
      </div>
    `,
  });
}
