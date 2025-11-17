import { cookies } from "next/headers";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";

export function createServerClient() {
  const cookieStorePromise = Promise.resolve(cookies());

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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
