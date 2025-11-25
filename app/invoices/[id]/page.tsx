// app/invoices/[id]/page.tsx
import Image from "next/image";
import { redirect } from "next/navigation";

import { sendInvoiceEmail } from "@/utils/email/sendInvoiceEmail";
import { sendInvoiceSms } from "@/utils/sms/sendInvoiceSms";
import { createServerClient } from "@/utils/supabase/server";
import { logMessage } from "@/utils/communications/logMessage";
import { createSignedMediaUrl } from "@/utils/supabase/storage";
import { getCurrentWorkspace, getWorkspaceProfile } from "@/utils/workspaces";
import { logAuditEvent } from "@/utils/audit/log";
import { publicInvoiceUrl } from "@/utils/urls/public";
import { SmsActionButton } from "@/components/sms/SmsActionButton";

type InvoiceWithRelations = {
  id: string;
  invoice_number: number | null;
  status: string | null;
  total: number | null;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  public_token: string | null;
  customer_name: string | null;
  customer_email: string | null;
  stripe_payment_link_url: string | null;
  job_id: string | null;
  quote_id: string;
  quotes:
    | {
        id: string;
        stripe_payment_link_url: string | null;
        jobs:
          | {
              id: string;
              customer_id?: string | null;
              title: string | null;
              customers:
                | {
                    id: string | null;
                    name: string | null;
                    email: string | null;
                    phone: string | null;
                  }
                | {
                    id: string | null;
                    name: string | null;
                    email: string | null;
                    phone: string | null;
                  }[]
                | null;
            }
          | {
              id: string;
              customer_id?: string | null;
              title: string | null;
              customers:
                | {
                    id: string | null;
                    name: string | null;
                    email: string | null;
                    phone: string | null;
                  }
                | {
                    id: string | null;
                    name: string | null;
                    email: string | null;
                    phone: string | null;
                  }[]
                | null;
            }[]
          | null;
      }
    | null;
};

type QuotePayment = {
  id: string;
  amount: number;
  currency: string | null;
  created_at: string;
  stripe_payment_intent_id: string | null;
  customer_email: string | null;
};

type MediaItem = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  created_at: string | null;
  signed_url: string | null;
  caption?: string | null;
  kind?: string | null;
  storage_path?: string | null;
};

function extractJobTitle(invoice: InvoiceWithRelations) {
  const job = invoice.quotes?.jobs;
  if (!job) return null;
  if (Array.isArray(job)) {
    return job[0]?.title ?? null;
  }
  return job.title ?? null;
}

function extractJobId(invoice: InvoiceWithRelations) {
  const job = invoice.quotes?.jobs;
  if (!job) return invoice.job_id ?? null;
  if (Array.isArray(job)) {
    return job[0]?.id ?? invoice.job_id ?? null;
  }
  return job.id ?? invoice.job_id ?? null;
}

function extractCustomer(invoice: InvoiceWithRelations) {
  const job = invoice.quotes?.jobs;
  if (!job) {
    return {
      id: null,
      name: invoice.customer_name,
      email: invoice.customer_email,
      phone: null,
    };
  }
  const normalizedJob = Array.isArray(job) ? job[0] : job;
  const customer = normalizedJob?.customers;
  if (!customer) {
    return {
      id: null,
      name: invoice.customer_name,
      email: invoice.customer_email,
      phone: null,
    };
  }
  if (Array.isArray(customer)) {
    return (
      customer[0] ?? {
        id: null,
        name: invoice.customer_name,
        email: invoice.customer_email,
        phone: null,
      }
    );
  }
  return customer;
}

async function sendInvoiceEmailAction(formData: FormData) {
  "use server";

  const invoiceId = String(formData.get("invoice_id"));
  const supabase = await createServerClient();
  const { user, workspace } = await getCurrentWorkspace({ supabase });
  const workspaceProfile = await getWorkspaceProfile({ supabase });

  // Workspace_id guard ensures both owner and staff members can view/send invoices for their workspace; user_id is only used for audit/logging.
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `
        *,
        quotes (
          id,
          stripe_payment_link_url,
          jobs (
            id,
            customer_id,
            title,
            customers (
              id,
              name,
              email,
              phone
            )
          )
        )
      `
    )
    .eq("id", invoiceId)
    .eq("workspace_id", workspace.id)
    .single();

  if (!invoice) {
    console.warn("Invoice not found.");
    return;
  }

  const invoiceRecord = invoice as InvoiceWithRelations;
  const customer = extractCustomer(invoiceRecord);

  if (!customer?.email) {
    console.warn("No email available for this invoice.");
    return;
  }

  const publicUrl = invoice.public_token
    ? publicInvoiceUrl(invoice.public_token)
    : "/public/invoices";
  const invoiceTotal = Number(invoice.total ?? 0);

  await sendInvoiceEmail({
    to: customer.email,
    customerName: customer.name,
    invoiceNumber: invoice.invoice_number ?? invoice.id.slice(0, 8),
    invoiceTotal,
    dueDate: invoice.due_at,
    publicUrl,
    workspace: workspaceProfile,
  });

  await logMessage({
    supabase,
    userId: user.id,
    workspaceId: workspace.id,
    customerId: customer.id,
    jobId: extractJobId(invoiceRecord),
    quoteId: invoiceRecord.quote_id,
    invoiceId: invoiceRecord.id,
    channel: "email",
    subject: `Invoice ${invoice.invoice_number ?? invoice.id.slice(0, 8)} sent`,
    body: `Invoice total $${invoiceTotal.toFixed(2)}. View: ${publicUrl}`,
  });

  await logAuditEvent({
    supabase,
    workspaceId: workspace.id,
    actorUserId: user.id,
    action: "invoice_sent",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: { channel: "email", total: invoiceTotal },
  });

  if (invoice.status !== "paid") {
    await supabase
      .from("invoices")
      .update({
        status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
  }

  redirect(`/invoices/${invoice.id}`);
}

type SendInvoiceSmsArgs = { invoiceId: string };

export async function sendInvoiceSmsAction({ invoiceId }: SendInvoiceSmsArgs) {
  "use server";

  const supabase = await createServerClient();
  const { user, workspace } = await getCurrentWorkspace({ supabase });

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `
        *,
        quotes (
          id,
          stripe_payment_link_url,
          jobs (
            id,
            customer_id,
            title,
            customers (
              id,
              name,
              email,
              phone
            )
          )
        )
      `
    )
    .eq("id", invoiceId)
    .eq("workspace_id", workspace.id)
    .single();

  if (!invoice) {
    const error = "Invoice not found.";
    console.warn("[sendInvoiceSmsAction] " + error);
    return {
      ok: false,
      error,
      sentAt: new Date().toISOString(),
      fromAddress: null,
    };
  }

  const invoiceRecord = invoice as InvoiceWithRelations;
  const customer = extractCustomer(invoiceRecord);

  if (!customer?.phone) {
    const error = "No phone number available for this invoice.";
    console.warn("[sendInvoiceSmsAction] " + error);
    return {
      ok: false,
      error,
      sentAt: new Date().toISOString(),
      fromAddress: null,
    };
  }

  const publicUrl = invoice.public_token
    ? publicInvoiceUrl(invoice.public_token)
    : "/public/invoices";
  const invoiceTotal = Number(invoice.total ?? 0);

  const smsResult = await sendInvoiceSms({
    supabase,
    workspaceId: workspace.id,
    userId: user.id,
    to: customer.phone,
    customerId: customer.id,
    jobId: extractJobId(invoiceRecord),
    quoteId: invoiceRecord.quote_id,
    invoiceId: invoiceRecord.id,
    customerName: customer.name,
    invoiceNumber: invoice.invoice_number ?? invoice.id.slice(0, 8),
    invoiceTotal,
    publicUrl,
  });

  await logAuditEvent({
    supabase,
    workspaceId: workspace.id,
    actorUserId: user.id,
    action: "invoice_sent",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: { channel: "sms", total: invoiceTotal },
  });

  if (invoice.status !== "paid") {
    await supabase
      .from("invoices")
      .update({
        status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
  }

  return smsResult;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { data: invoiceData } = await supabase
    .from("invoices")
    .select(
      `
        *,
        quotes (
          id,
          stripe_payment_link_url,
          jobs (
            id,
            customer_id,
            title,
            customers (
              id,
              name,
              email,
              phone
            )
          )
        )
      `
    )
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .single();

  const invoice = invoiceData as InvoiceWithRelations | null;
  if (!invoice) redirect("/invoices");

  const { data: payments } = await supabase
    .from("quote_payments")
    .select("id, amount, currency, created_at, stripe_payment_intent_id, customer_email")
    .eq("quote_id", invoice.quote_id)
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  const { data: mediaRows } = await supabase
    .from("media")
    .select("id, file_name, mime_type, created_at, caption, kind, storage_path, bucket_id, url")
    .eq("invoice_id", invoice.id)
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  const mediaItems: MediaItem[] = await Promise.all(
    (mediaRows ?? []).map(async (media) => {
      const path = media.storage_path || "";
      if (!path) {
        return { ...media, signed_url: media.url ?? null };
      }
      const { signedUrl } = await createSignedMediaUrl(path, 60 * 60);
      return {
        id: media.id,
        file_name: media.file_name,
        mime_type: media.mime_type,
        created_at: media.created_at,
        caption: media.caption,
        kind: media.kind,
        storage_path: media.storage_path,
        signed_url: signedUrl ?? media.url ?? null,
      };
    }),
  );

  // quote_payments references quote_id, so ensure we query using invoice.quote_id
  const paymentsForQuote = (payments ?? []) as QuotePayment[];
  const jobTitle = extractJobTitle(invoice) || "Untitled job";
  const customer = extractCustomer(invoice);
  const publicUrl = invoice.public_token
    ? publicInvoiceUrl(invoice.public_token)
    : "/public/invoices";
  const quotePaymentLink =
    invoice.stripe_payment_link_url ?? invoice.quotes?.stripe_payment_link_url ?? null;
  const isPaid = invoice.status === "paid";

  return (
    <div className="space-y-4">
      <div className="hb-card space-y-1">
        <h1>Invoice</h1>
        <p className="hb-muted text-sm">
          Invoice #{invoice.invoice_number ?? invoice.id.slice(0, 8)}
        </p>
        <p className="hb-muted">Job: {jobTitle}</p>
        <p className="hb-muted">Customer: {customer?.name || "Unknown"}</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Status:</span>
          <span className={isPaid ? "text-emerald-400" : ""}>
            {invoice.status}
          </span>
        </div>
        {invoice.paid_at && (
          <p className="hb-muted text-xs">
            Paid on {new Date(invoice.paid_at).toLocaleDateString()}
          </p>
        )}
        <p className="hb-muted text-xs">
          Issued {invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString() : "—"} · Due{" "}
          {invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : "No due date"}
        </p>
      </div>

      <div className="hb-card space-y-2">
        <h3>Total</h3>
        <p className="text-2xl font-semibold">
          ${Number(invoice.total ?? 0).toFixed(2)}
        </p>
        <a href={publicUrl} target="_blank" rel="noreferrer" className="hb-button-ghost text-sm">
          Copy public invoice link
        </a>
      </div>

      {mediaItems.length > 0 && (
        <div className="hb-card space-y-2">
          <h3>Media</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mediaItems.map((media) => {
              const isImage = media.mime_type?.startsWith("image/");
              return (
                <div key={media.id} className="rounded-lg border border-slate-800 bg-slate-900/60">
                <div className="relative aspect-video w-full bg-slate-950/60">
                  {media.signed_url ? (
                    isImage ? (
                      <Image
                        src={media.signed_url}
                        alt={media.file_name || "Media"}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        unoptimized
                      />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
                          <div className="rounded-full border border-slate-800 px-3 py-1 text-xs uppercase tracking-wide text-slate-200">
                            {(media.file_name?.split(".").pop() || "file").toUpperCase()}
                          </div>
                          <a
                            href={media.signed_url}
                            target="_blank"
                            rel="noreferrer"
                            className="hb-button-ghost text-xs"
                          >
                            Open
                          </a>
                        </div>
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">
                        Preview unavailable
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-sm font-semibold truncate">{media.file_name || "Untitled file"}</p>
                    {media.caption && <p className="hb-muted text-xs truncate">{media.caption}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="hb-card space-y-3">
        <h3>Send to customer</h3>
        <div className="flex flex-wrap gap-2">
          <form action={sendInvoiceEmailAction}>
            <input type="hidden" name="invoice_id" value={invoice.id} />
            <button type="submit" className="hb-button" disabled={isPaid}>
              Send invoice via email
            </button>
          </form>

          <SmsActionButton
            action={sendInvoiceSmsAction}
            args={{ invoiceId: invoice.id }}
            label="Send invoice via SMS"
            buttonClassName="hb-button-ghost"
            disabled={isPaid}
            successMessage="Invoice sent via SMS."
            errorMessage="Couldn’t send SMS; please verify the customer’s phone."
          />
        </div>
        {isPaid && (
          <p className="hb-muted text-xs">
            Invoice paid — sending options disabled.
          </p>
        )}
      </div>

      {quotePaymentLink && !isPaid && (
        <div className="hb-card space-y-2">
          <h3>Payment link</h3>
          <a
            href={quotePaymentLink}
            className="hb-button w-full text-center"
            target="_blank"
            rel="noreferrer"
          >
            Open Stripe payment link
          </a>
        </div>
      )}

      <div className="hb-card space-y-2">
        <h3>Payment history</h3>
        {paymentsForQuote.length === 0 ? (
          <p className="hb-muted text-sm">No payments recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {paymentsForQuote.map((payment) => (
              <div key={payment.id} className="rounded border border-slate-800 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-semibold">
                    ${payment.amount.toFixed(2)} {payment.currency?.toUpperCase() || "USD"}
                  </span>
                  <span className="hb-muted text-xs">
                    {new Date(payment.created_at).toLocaleString()}
                  </span>
                </div>
                {payment.stripe_payment_intent_id && (
                  <p className="hb-muted text-xs">
                    Intent: {payment.stripe_payment_intent_id}
                  </p>
                )}
                {payment.customer_email && (
                  <p className="hb-muted text-xs">
                    Customer: {payment.customer_email}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
