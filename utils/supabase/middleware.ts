// utils/supabase/middleware.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
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
      async get(name: string) {
        const equalCookie = request.cookies.get(name);
        if (!equalCookie) return null;
        return { name: equalCookie.name, value: equalCookie.value };
      },
      async getAll() {
        return request.cookies
          .getAll()
          .map((cookie) => ({ name: cookie.name, value: cookie.value }));
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
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
      remove(name: string, options: CookieOptions) {
        response.cookies.set({
          name,
          value: "",
          maxAge: 0,
          expires: new Date(0),
          ...options,
        });
      },
    },
  });

  // This refreshes session tokens and syncs cookies.
  await supabase.auth.getSession();

  return response;
}
