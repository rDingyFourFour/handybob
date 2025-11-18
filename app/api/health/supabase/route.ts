import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase env vars missing" },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(url, serviceKey);

    // Lightweight admin call to verify the service key works.
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, auth_enabled: !!data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
