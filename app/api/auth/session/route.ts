"use server";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";

import {
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL,
} from "@/utils/env/public";

type SessionPayload = {
  session?: {
    access_token?: string | null;
    refresh_token?: string | null;
  };
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as SessionPayload;

  const response = NextResponse.json({ ok: true });
  const supabase = createSupabaseServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        async getAll() {
          return request.cookies.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }));
        },
        setAll(cookiesList) {
          for (const cookie of cookiesList) {
            response.cookies.set({
              name: cookie.name,
              value: cookie.value,
              ...cookie.options,
            });
          }
        },
      },
    }
  );

  if (body.session?.access_token || body.session?.refresh_token) {
    await supabase.auth.setSession({
      access_token: body.session.access_token ?? undefined,
      refresh_token: body.session.refresh_token ?? undefined,
    });
  } else {
    await supabase.auth.getSession();
  }

  return response;
}
