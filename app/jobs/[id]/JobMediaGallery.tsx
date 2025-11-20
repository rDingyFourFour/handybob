"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteJobMedia,
  uploadJobMedia,
  linkJobMedia,
  toggleMediaVisibility,
  type UploadMediaState,
} from "./mediaActions";

export type MediaItem = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  created_at: string | null;
  signed_url: string | null;
  caption?: string | null;
  kind?: string | null;
  quote_id?: string | null;
  invoice_id?: string | null;
  is_public?: boolean | null;
};

type Props = {
  jobId: string;
  items: MediaItem[];
  loadError?: string | null;
  canDelete?: boolean;
  quoteOptions?: { id: string; label: string }[];
  invoiceOptions?: { id: string; label: string }[];
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

export function JobMediaGallery({
  jobId,
  items,
  loadError,
  canDelete = true,
  quoteOptions = [],
  invoiceOptions = [],
}: Props) {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [kind, setKind] = useState("auto");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [visibilityId, setVisibilityId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<UploadMediaState, FormData>(
    uploadJobMedia,
    {} as UploadMediaState,
  );

  const selectionLabel = useMemo(() => {
    if (!selectedFiles.length) return "No file chosen";
    if (selectedFiles.length === 1) return selectedFiles[0].name;
    return `${selectedFiles.length} files selected`;
  }, [selectedFiles]);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      setCaption("");
      setKind("auto");
      setSelectedFiles([]);
      setDeleteError(null);
      setDeletingId(null);
      setVisibilityError(null);
      setVisibilityId(null);
    }
  }, [state?.ok, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
  };

  const handleSubmit = (formData: FormData) => {
    // ensure kind/caption propagate with current UI state
    formData.set("caption", caption);
    formData.set("kind", kind);
    formData.delete("file");
    selectedFiles.forEach((file) => formData.append("file", file));
    formAction(formData);
  };

  const handleDelete = (mediaId: string) => (formData: FormData) => {
    if (!confirm("Are you sure you want to delete this media item?")) return;
    setDeleteError(null);
    setDeletingId(mediaId);
    startDelete(async () => {
      const res = await deleteJobMedia(formData);
      if (res?.error) {
        setDeleteError(res.error);
        setDeletingId(null);
        return;
      }
      setDeletingId(null);
      router.refresh();
    });
  };

  const handleLink =
    (mediaId: string, target: "quote" | "invoice") => async (formData: FormData) => {
      setLinkError(null);
      setLinkingId(mediaId);
      const result = await linkJobMedia(null, formData);
      if (result?.error) {
        setLinkError(result.error);
        setLinkingId(null);
        return;
      }
      setLinkingId(null);
      router.refresh();
    };

  const handleVisibility =
    (mediaId: string, currentPublic: boolean | null | undefined) => async (formData: FormData) => {
      setVisibilityError(null);
      setVisibilityId(mediaId);
      formData.set("is_public", String(!currentPublic));
      const res = await toggleMediaVisibility(formData);
      if (res?.error) {
        setVisibilityError(res.error);
        setVisibilityId(null);
        return;
      }
      setVisibilityId(null);
      router.refresh();
    };

  return (
    <div className="hb-card space-y-3" id="job-media">
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

      <form action={handleSubmit} className="space-y-3" encType="multipart/form-data">
        <input type="hidden" name="job_id" value={jobId} />
        <div className="grid gap-3 md:grid-cols-[1fr,220px] md:items-center">
          <div className="space-y-2">
            <label className="block text-sm hb-muted">
              Files
              <input
                type="file"
                name="file"
                multiple
                required
                onChange={handleFileChange}
                className="hb-input mt-1"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.mp3,.wav"
              />
            </label>
            <p className="text-xs text-slate-400">{selectionLabel}</p>
          </div>
          <div className="space-y-2">
            <label className="block text-sm hb-muted">
              Kind
              <select
                name="kind"
                className="hb-input mt-1"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="auto">Auto-detect</option>
                <option value="photo">Photo</option>
                <option value="document">Document</option>
                <option value="audio">Audio</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
        </div>
        <label className="block text-sm hb-muted">
          Caption (optional, applies to all selected files)
          <input
            name="caption"
            className="hb-input mt-1"
            placeholder="e.g. Kitchen before photo"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>
        <button className="hb-button" disabled={pending || !selectedFiles.length}>
          {pending ? "Uploading..." : "Upload media"}
        </button>
        {state?.error && (
          <p className="text-sm text-red-400">
            Upload failed. {state.error}
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
                  {item.caption && <p className="hb-muted text-sm truncate">{item.caption}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="hb-muted text-xs">{formatDate(item.created_at)}</p>
                    <span className="text-[10px] uppercase tracking-wide rounded-full border border-slate-800 px-2 py-0.5">
                      {item.is_public ? "Public" : "Internal"}
                    </span>
                  </div>
                  {canDelete && (
                    <form
                      className="pt-2 flex items-center gap-2"
                      action={handleVisibility(item.id, item.is_public)}
                    >
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="media_id" value={item.id} />
                      <input type="hidden" name="is_public" value={item.is_public ? "true" : "false"} />
                      <button
                        type="submit"
                        className="hb-button-ghost text-xs"
                        disabled={visibilityId === item.id}
                      >
                        {visibilityId === item.id
                          ? "Updating..."
                          : item.is_public
                            ? "Make internal only"
                            : "Make public on quote/invoice"}
                      </button>
                    </form>
                  )}
                  {canDelete && (
                    <form
                      action={handleDelete(item.id)}
                      className="pt-2"
                    >
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="media_id" value={item.id} />
                      <button
                        type="submit"
                        className="hb-button-ghost text-xs text-red-300"
                        disabled={isDeleting && deletingId === item.id}
                      >
                        {isDeleting && deletingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </form>
                  )}
                  {(quoteOptions.length > 0 || invoiceOptions.length > 0) && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {quoteOptions.length > 0 && (
                        <form className="flex items-center gap-2" action={handleLink(item.id, "quote")}>
                          <input type="hidden" name="job_id" value={jobId} />
                          <input type="hidden" name="media_id" value={item.id} />
                          <select
                            name="quote_id"
                            className="hb-input text-xs"
                            defaultValue={item.quote_id || quoteOptions[0]?.id}
                            disabled={linkingId === item.id}
                          >
                            {quoteOptions.map((q) => (
                              <option key={q.id} value={q.id}>
                                {q.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="hb-button-ghost text-xs"
                            disabled={linkingId === item.id}
                          >
                            {linkingId === item.id ? "Attaching..." : "Attach to quote"}
                          </button>
                        </form>
                      )}
                      {invoiceOptions.length > 0 && (
                        <form className="flex items-center gap-2" action={handleLink(item.id, "invoice")}>
                          <input type="hidden" name="job_id" value={jobId} />
                          <input type="hidden" name="media_id" value={item.id} />
                          <select
                            name="invoice_id"
                            className="hb-input text-xs"
                            defaultValue={item.invoice_id || invoiceOptions[0]?.id}
                            disabled={linkingId === item.id}
                          >
                            {invoiceOptions.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="hb-button-ghost text-xs"
                            disabled={linkingId === item.id}
                          >
                            {linkingId === item.id ? "Attaching..." : "Attach to invoice"}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {deleteError && (
        <p className="text-sm text-red-400">Could not delete media. {deleteError}</p>
      )}
        {linkError && (
          <p className="text-sm text-red-400">Could not attach media. {linkError}</p>
        )}
        {visibilityError && (
          <p className="text-sm text-red-400">Could not update visibility. {visibilityError}</p>
        )}
    </div>
  );
}
