// utils/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

import { NEXT_PUBLIC_SUPABASE_URL } from "@/utils/env/public";
import { getServiceRoleKey } from "@/utils/env/server";

// Accesses Supabase with the service role key. Intended strictly for server-only contexts (webhooks, cron jobs, public APIs that bypass RLS).
export function createAdminClient() {
  return createClient(NEXT_PUBLIC_SUPABASE_URL, getServiceRoleKey());
}
