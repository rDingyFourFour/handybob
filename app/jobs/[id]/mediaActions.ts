"use server";

import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { MEDIA_BUCKET_ID, createSignedMediaUrl } from "@/utils/supabase/storage";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB, aligned with Supabase storage default

export type UploadMediaState = {
  ok?: boolean;
  error?: string;
};

export type DeleteMediaState = {
  ok?: boolean;
  error?: string;
};

export type LinkMediaState = {
  ok?: boolean;
  error?: string;
};

export type VisibilityState = {
  ok?: boolean;
  error?: string;
};

function buildStoragePath(userId: string, jobId: string, fileName: string) {
  const safeName = fileName?.trim() || "upload";
  const extension = safeName.includes(".") ? safeName.slice(safeName.lastIndexOf(".")).toLowerCase() : "";
  const uniqueId = crypto.randomUUID();
  return `${userId}/${jobId}/${uniqueId}${extension}`;
}

function inferKind(mime: string | undefined | null): "photo" | "document" | "audio" | "other" {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.includes("pdf") || mime.includes("msword") || mime.includes("spreadsheet") || mime.includes("officedocument")) {
    return "document";
  }
  return "other";
}

export async function uploadJobMedia(
  _prev: UploadMediaState | null,
  formData: FormData,
): Promise<UploadMediaState> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const jobId = String(formData.get("job_id") || "");
  const caption = (formData.get("caption") || "").toString().trim() || null;
  const requestedKind = (formData.get("kind") || "auto").toString().trim();
  const files = formData.getAll("file").filter((value) => value instanceof File) as File[];

  if (!jobId) return { error: "Job ID is required." };
  if (!files.length) return { error: "Please choose at least one file to upload." };

  // Ensure the job belongs to the current user (RLS also enforces this).
  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .single();
  if (!job) return { error: "Job not found or inaccessible." };

  const now = new Date().toISOString();

  for (const file of files) {
    if (file.size === 0) return { error: `File ${file.name} is empty.` };
    if (file.size > MAX_FILE_BYTES) return { error: `File ${file.name} exceeds 50MB.` };
  }

  for (const file of files) {
    const kind = requestedKind === "auto" ? inferKind(file.type) : (requestedKind as "photo" | "document" | "audio" | "other");
    const storagePath = buildStoragePath(user.id, jobId, file.name);

    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET_ID).upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (uploadError) {
      return { error: uploadError.message };
    }

    const { signedUrl } = await createSignedMediaUrl(storagePath, 60 * 60); // store a usable URL; will be refreshed on read

    const { error: insertError } = await supabase.from("media").insert({
      user_id: user.id,
      job_id: jobId,
      bucket_id: MEDIA_BUCKET_ID,
      storage_path: storagePath,
      file_name: file.name || "upload",
      mime_type: file.type || null,
      size_bytes: file.size,
      created_at: now,
      url: signedUrl || storagePath,
      kind,
      caption: caption || null,
    });

    if (insertError) {
      await supabase.storage.from(MEDIA_BUCKET_ID).remove([storagePath]);
      return { error: insertError.message };
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function deleteJobMedia(formData: FormData): Promise<DeleteMediaState> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const mediaId = String(formData.get("media_id") || "");
  const jobId = String(formData.get("job_id") || "");
  if (!mediaId || !jobId) return { error: "Invalid media reference." };

  const { data: mediaRow, error: fetchError } = await supabase
    .from("media")
    .select("id, user_id, bucket_id, storage_path")
    .eq("id", mediaId)
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .single();

  if (fetchError) return { error: fetchError.message };
  if (!mediaRow?.storage_path) return { error: "Media not found or missing path." };

  const bucket = mediaRow.bucket_id || MEDIA_BUCKET_ID;
  const path = mediaRow.storage_path;

  const { error: storageError } = await supabase.storage.from(bucket).remove([path]);
  if (storageError) return { error: storageError.message };

  const { error: deleteError } = await supabase.from("media").delete().eq("id", mediaId).eq("user_id", user.id);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function linkJobMedia(_prev: LinkMediaState | null, formData: FormData): Promise<LinkMediaState> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const mediaId = String(formData.get("media_id") || "");
  const jobId = String(formData.get("job_id") || "");
  const quoteId = (formData.get("quote_id") || "").toString().trim() || null;
  const invoiceId = (formData.get("invoice_id") || "").toString().trim() || null;

  if (!mediaId || !jobId) return { error: "Invalid media reference." };
  if (!quoteId && !invoiceId) return { error: "Choose a quote or invoice to attach." };

  const { error: updateError } = await supabase
    .from("media")
    .update({ quote_id: quoteId || null, invoice_id: invoiceId || null })
    .eq("id", mediaId)
    .eq("job_id", jobId)
    .eq("user_id", user.id);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function toggleMediaVisibility(formData: FormData): Promise<VisibilityState> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const mediaId = String(formData.get("media_id") || "");
  const jobId = String(formData.get("job_id") || "");
  const isPublic = String(formData.get("is_public") || "false") === "true";

  if (!mediaId || !jobId) return { error: "Invalid media reference." };

  const { error } = await supabase
    .from("media")
    .update({ is_public: isPublic })
    .eq("id", mediaId)
    .eq("job_id", jobId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}
