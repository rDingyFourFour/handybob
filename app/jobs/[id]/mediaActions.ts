"use server";

import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB, aligned with Supabase storage default
const MEDIA_BUCKET_ID = "job-media";

export type UploadMediaState = {
  ok?: boolean;
  error?: string;
};

function buildStoragePath(userId: string, jobId: string, fileName: string) {
  const safeName = fileName?.trim() || "upload";
  const extension = safeName.includes(".") ? safeName.slice(safeName.lastIndexOf(".")).toLowerCase() : "";
  const uniqueId = crypto.randomUUID();
  return `${userId}/${jobId}/${uniqueId}${extension}`;
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
  const file = formData.get("file");

  if (!jobId) return { error: "Job ID is required." };
  if (!(file instanceof File)) return { error: "Please choose a file to upload." };
  if (file.size === 0) return { error: "File is empty." };
  if (file.size > MAX_FILE_BYTES) return { error: "Max file size is 50MB." };

  // Ensure the job belongs to the current user (RLS also enforces this).
  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .single();
  if (!job) return { error: "Job not found or inaccessible." };

  const objectPath = buildStoragePath(user.id, jobId, file.name);

  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET_ID).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (uploadError) {
    return { error: uploadError.message };
  }

  const { error: insertError } = await supabase.from("media").insert({
    user_id: user.id,
    job_id: jobId,
    bucket_id: MEDIA_BUCKET_ID,
    storage_path: objectPath,
    file_name: file.name || "upload",
    mime_type: file.type || null,
    size_bytes: file.size,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    await supabase.storage.from(MEDIA_BUCKET_ID).remove([objectPath]);
    return { error: insertError.message };
  }

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}
