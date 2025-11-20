"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { uploadJobMedia, type UploadMediaState } from "./mediaActions";

export type MediaItem = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  created_at: string | null;
  signed_url: string | null;
};

type Props = {
  jobId: string;
  items: MediaItem[];
  loadError?: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function getExtension(fileName: string | null) {
  if (!fileName) return "file";
  const parts = fileName.split(".");
  if (parts.length < 2) return "file";
  return parts.pop()?.toUpperCase() || "file";
}

export function JobMediaGallery({ jobId, items, loadError }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<UploadMediaState, FormData>(
    uploadJobMedia,
    {} as UploadMediaState,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state?.ok, router]);

  return (
    <div className="hb-card space-y-3">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
            Media
          </p>
          <h2 className="text-lg font-semibold">Job photos &amp; documents</h2>
          <p className="hb-muted text-sm">
            Upload pictures, receipts, permits, and other files for this job.
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-2" encType="multipart/form-data">
        <input type="hidden" name="job_id" value={jobId} />
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            type="file"
            name="file"
            required
            className="hb-input max-w-xl"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          />
          <button className="hb-button" disabled={pending}>
            {pending ? "Uploading..." : "Upload media"}
          </button>
        </div>
        {state?.error && (
          <p className="text-sm text-red-400">
            Could not upload. {state.error}
          </p>
        )}
        {loadError && (
          <p className="text-sm text-red-400">
            Could not load existing media. {loadError}
          </p>
        )}
        {state?.ok && !state.error && (
          <p className="text-sm text-green-400">Upload complete. Refreshing…</p>
        )}
      </form>

      {items.length === 0 ? (
        <p className="hb-muted text-sm">No media uploaded for this job yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const isImage = item.mime_type?.startsWith("image/");
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40"
              >
                <div className="aspect-video w-full bg-slate-950/60">
                  {item.signed_url ? (
                    isImage ? (
                      <img
                        src={item.signed_url}
                        alt={item.file_name || "Job media"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
                        <div className="rounded-full border border-slate-800 px-3 py-1 text-xs uppercase tracking-wide text-slate-200">
                          {getExtension(item.file_name)}
                        </div>
                        <a
                          href={item.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="hb-button-ghost text-xs"
                        >
                          Open document
                        </a>
                      </div>
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-500">
                      Preview unavailable
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-semibold truncate">{item.file_name || "Untitled file"}</p>
                  <p className="hb-muted text-xs">{formatDate(item.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
