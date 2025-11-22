import { cookies } from "next/headers";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";

import {
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL,
} from "@/utils/env/public";

// Server-side Supabase client that preserves the incoming request cookies (auth/session). Use this inside Next.js server components/actions that run for authenticated users.
export function createServerClient() {
  const cookieStorePromise = Promise.resolve(cookies());

  return createSupabaseServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        async getAll() {
          const cookieStore = await cookieStorePromise;
          return cookieStore
            .getAll()
            .map((cookie) => ({ name: cookie.name, value: cookie.value }));
        },
      },
    }
  );
}
