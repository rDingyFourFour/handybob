import { NextResponse } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";

// Verifies the service-role connection to Supabase for readiness checks.
export async function GET() {
  try {
    const supabase = createAdminClient();

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
