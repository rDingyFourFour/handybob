import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/utils/supabase/server";

export type PricingSettings = {
  id: string;
  user_id: string;
  hourly_rate: number;
  minimum_job_fee: number | null;
  travel_fee: number | null;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_PRICING_SETTINGS: Omit<PricingSettings, "id" | "user_id"> =
  {
    hourly_rate: 125,
    minimum_job_fee: 0,
    travel_fee: 0,
  };

type EnsurePricingOptions = {
  supabase?: SupabaseClient;
  userId?: string;
};

/**
 * Ensures the authenticated user has pricing settings configured.
 * Creates a default record if none exists and returns the resulting row.
 */
export async function ensurePricingSettings(
  options: EnsurePricingOptions = {}
) {
  const supabase = options.supabase ?? createServerClient();

  let resolvedUserId = options.userId;

  if (!resolvedUserId) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user)
      throw new Error("You must be signed in to load pricing settings.");

    resolvedUserId = user.id;
  }

  const { data: existing, error } = await supabase
    .from("pricing_settings")
    .select("*")
    .eq("user_id", resolvedUserId)
    .maybeSingle<PricingSettings>();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  if (existing) {
    return existing;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("pricing_settings")
    .insert({
      user_id: resolvedUserId,
      ...DEFAULT_PRICING_SETTINGS,
    })
    .select()
    .single<PricingSettings>();

  if (insertError) {
    throw insertError;
  }

  return inserted;
}
