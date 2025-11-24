// utils/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Supabase environment variables are missing in proxy.");
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      async getAll() {
        return request.cookies
          .getAll()
          .map((cookie) => ({ name: cookie.name, value: cookie.value }));
      },
      setAll(cookies) {
        for (const cookie of cookies) {
          response.cookies.set({
            name: cookie.name,
            value: cookie.value,
            ...cookie.options,
          });
        }
      },
    },
  });

  // This refreshes session tokens and syncs cookies.
  await supabase.auth.getSession();

  return response;
}
