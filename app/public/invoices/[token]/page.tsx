// Public invoice page: uses the invoice token + admin client; exposes only customer-visible fields without auth.
import Image from "next/image";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/utils/supabase/admin";

type MediaItem = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  caption?: string | null;
  signed_url: string | null;
};

export default async function PublicInvoicePage({
  params,
}: {
  params: { token: string };
}) {
  // Server-only: resolve invoice via admin client by public_token; no auth required on public link.
  const supabase = createAdminClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `
        *,
        quotes (
          id,
          stripe_payment_link_url,
          jobs (
            title
          )
        ),
        workspaces (
          name,
          brand_name,
          brand_tagline,
          business_email,
          business_phone,
          business_address
        )
      `
    )
    .eq("public_token", params.token)
    .single();

  if (!invoice) {
    return notFound();
  }

  const jobTitle = invoice.quotes?.jobs
    ? Array.isArray(invoice.quotes.jobs)
      ? invoice.quotes.jobs[0]?.title
      : invoice.quotes.jobs.title
    : null;
  const workspace = invoice.workspaces; // public-safe: only brand/phone/email/address, no internal secrets

  const payUrl =
    invoice.status !== "paid"
      ? invoice.stripe_payment_link_url || invoice.quotes?.stripe_payment_link_url
      : null;

  const lineItems = (invoice.line_items as { scope?: string }[] | null) ?? [];
  const scope = lineItems[0]?.scope ?? null;

  const { data: mediaRows } = await supabase
    .from("media")
    .select("id, file_name, mime_type, caption, storage_path, bucket_id, url")
    .eq("invoice_id", invoice.id)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  const mediaItems: MediaItem[] = await Promise.all(
    (mediaRows ?? []).map(async (media) => {
      const path = media.storage_path || "";
      if (!path) {
        return { id: media.id, file_name: media.file_name, mime_type: media.mime_type, caption: media.caption, signed_url: media.url ?? null };
      }
      const bucketId = media.bucket_id || "job-media";
      const { data: signed } = await supabase.storage.from(bucketId).createSignedUrl(path, 60 * 60);
      return {
        id: media.id,
        file_name: media.file_name,
        mime_type: media.mime_type,
        caption: media.caption,
        signed_url: signed?.signedUrl ?? media.url ?? null,
      };
    }),
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
      <div className="hb-card max-w-xl w-full space-y-4">
        <div>
          <h1>Invoice</h1>
          <p className="hb-muted">
            From: {workspace?.brand_name || workspace?.name || "HandyBob contractor"}
          </p>
          <p className="hb-muted">
            Job: {jobTitle || "Handyman work"}
          </p>
        </div>

        <div className="space-y-1">
          <h3>Total</h3>
          <p className="text-2xl font-semibold">
            ${Number(invoice.total ?? 0).toFixed(2)}
          </p>
          <p className="hb-muted text-sm">
            Status: {invoice.status}
          </p>
          {invoice.due_at && (
            <p className="hb-muted text-sm">
              Due {new Date(invoice.due_at).toLocaleDateString()}
            </p>
          )}
          {scope && (
            <p className="hb-muted text-sm">
              Work: {scope}
            </p>
          )}
        </div>

        {invoice.status === "paid" ? (
          <p className="text-sm text-emerald-400">Paid. Thank you!</p>
        ) : payUrl ? (
          <a
            href={payUrl as string}
            className="hb-button w-full text-center"
            target="_blank"
            rel="noreferrer"
          >
            Pay now
          </a>
        ) : (
          <p className="hb-muted text-xs">
            Payment is not available online for this invoice. Contact your contractor if you have questions.
          </p>
        )}

        {mediaItems.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3>Media</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {mediaItems.map((media) => {
                const isImage = media.mime_type?.startsWith("image/");
                return (
                  <div key={media.id} className="rounded-lg border border-slate-800 bg-slate-900/70">
                    <div className="relative aspect-video bg-slate-950/60">
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
                          <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs">
                            <div className="rounded-full border border-slate-800 px-3 py-1 uppercase tracking-wide text-slate-200">
                              {(media.file_name?.split(".").pop() || "file").toUpperCase()}
                            </div>
                            <a
                              href={media.signed_url}
                              target="_blank"
                              rel="noreferrer"
                              className="hb-button-ghost text-[11px]"
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
                    <div className="p-2 text-xs">
                      <p className="font-semibold truncate">{media.file_name || "Media"}</p>
                      {media.caption && <p className="hb-muted truncate">{media.caption}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm">
          <p className="font-semibold text-slate-100">Business info</p>
          <p className="hb-muted text-xs">Shared across workspace members.</p>
          <div className="mt-2 space-y-1 text-slate-200">
            <div>{workspace?.brand_name || workspace?.name || "HandyBob"}</div>
            {workspace?.brand_tagline && <div className="text-slate-400">{workspace.brand_tagline}</div>}
            {workspace?.business_email && <div className="text-slate-400">Email: {workspace.business_email}</div>}
            {workspace?.business_phone && <div className="text-slate-400">Phone: {workspace.business_phone}</div>}
            {workspace?.business_address && <div className="text-slate-400">{workspace.business_address}</div>}
          </div>
        </div>

        <p className="hb-muted text-[10px] text-center">
          Powered by HandyBob – full support office in an app.
        </p>
      </div>
    </div>
  );
}
