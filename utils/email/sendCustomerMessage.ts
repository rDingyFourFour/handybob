// utils/email/sendCustomerMessage.ts
"use server";

import { Resend } from "resend";

type SendCustomerMessageArgs = {
  to: string;
  subject?: string;
  body: string;
  from?: string | null;
};

let resendClient: Resend | null = null;

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendCustomerMessageEmail({
  to,
  subject,
  body,
  from,
}: SendCustomerMessageArgs) {
  const resend = getResend();
  if (!resend) {
    console.warn("[sendCustomerMessageEmail] RESEND_API_KEY not set; skipping email send.");
    return;
  }

  const fromAddress = from || process.env.QUOTE_FROM_EMAIL || "HandyBob <no-reply@example.com>";
  const safeSubject = subject?.trim() || "Message from HandyBob";

  await resend.emails.send({
    from: fromAddress,
    to,
    subject: safeSubject,
    text: body,
    html: `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px;">
        <p>${body.replace(/\n/g, "<br/>")}</p>
        <p style="margin-top: 24px; font-size: 12px; color: #64748b;">
          Sent via HandyBob – full support office in an app.
        </p>
      </div>
    `,
  });

  return fromAddress;
}
