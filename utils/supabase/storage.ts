import { createServerClient } from "./server";

const MEDIA_BUCKET_ID = "job-media"; // private bucket for job/uploads; served via signed URLs

/**
 * Creates a short-lived signed URL for a private media object.
 * Objects live under user-scoped prefixes (user_id/job_id/file.ext) in the job-media bucket.
 */
export async function createSignedMediaUrl(path: string, expiresInSeconds = 3600) {
  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET_ID)
    .createSignedUrl(path, expiresInSeconds);

  if (error) return { signedUrl: null, error };
  return { signedUrl: data?.signedUrl ?? null, error: null };
}

export { MEDIA_BUCKET_ID };
