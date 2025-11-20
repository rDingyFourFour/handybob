// app/public/quotes/[token]/page.tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";

type MediaItem = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  caption?: string | null;
  signed_url: string | null;
};

export default async function PublicQuotePage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createAdminClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      `
      *,
      jobs (
        title,
        customers (
          name,
          email,
          phone
        )
      )
    `
    )
    .eq("public_token", params.token)
    .single();

  if (!quote) {
    return notFound();
  }

  if (quote.public_expires_at && new Date(quote.public_expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="hb-card max-w-xl text-center space-y-2">
          <h1>This quote has expired</h1>
          <p className="hb-muted">
            Please contact your contractor to receive an updated quote.
          </p>
        </div>
      </div>
    );
  }

  const customer = quote.jobs?.customers;
  const canPay = Boolean(quote.stripe_payment_link_url);
  const { data: mediaRows } = await supabase
    .from("media")
    .select("id, file_name, mime_type, caption, storage_path, bucket_id, url")
    .eq("quote_id", quote.id)
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
          <h1>Quote</h1>
          <p className="hb-muted">
            From: HandyBob contractor
          </p>
          <p className="hb-muted">
            For: {customer?.name || "Customer"}
          </p>
        </div>

        <div className="space-y-2">
          <h3>Job</h3>
          <p className="text-sm text-slate-200">
            {quote.jobs?.title || "Handyman work"}
          </p>
          <p className="hb-muted">
            {quote.line_items?.[0]?.scope || quote.client_message_template}
          </p>
        </div>

        <div className="space-y-1">
          <h3>Total</h3>
          <p className="text-2xl font-semibold">
            ${quote.total.toFixed(2)}
          </p>
        </div>

        {canPay ? (
          <a
            href={quote.stripe_payment_link_url as string}
            className="hb-button w-full text-center"
            target="_blank"
            rel="noreferrer"
          >
            Pay now
          </a>
        ) : (
          <p className="hb-muted text-xs">
            Online payment is not set up for this quote yet. Please contact your
            contractor directly.
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
                    <div className="aspect-video bg-slate-950/60">
                      {media.signed_url ? (
                        isImage ? (
                          <img
                            src={media.signed_url}
                            alt={media.file_name || "Media"}
                            className="h-full w-full object-cover"
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

        <p className="hb-muted text-[10px] text-center">
          Powered by HandyBob – full support office in an app.
        </p>
      </div>
    </div>
  );
}
