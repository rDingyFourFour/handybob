import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

export type PricingSettings = {
  workspace_id: string;
  hourly_rate: number;
  minimum_job_fee: number | null;
  travel_fee: number | null;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_PRICING_SETTINGS: Omit<PricingSettings, "workspace_id"> = {
  hourly_rate: 125,
  minimum_job_fee: 0,
  travel_fee: 0,
};

type EnsurePricingOptions = {
  supabase?: SupabaseClient;
  workspaceId?: string;
};

/**
 * Ensures the authenticated user has pricing settings configured.
 * Creates a default record if none exists and returns the resulting row.
 */
export async function ensurePricingSettings(
  options: EnsurePricingOptions = {}
) {
  const supabase = options.supabase ?? await createServerClient();

  let resolvedWorkspaceId = options.workspaceId;

  if (!resolvedWorkspaceId) {
    const { workspace } = await getCurrentWorkspace({ supabase });
    resolvedWorkspaceId = workspace.id;
  }

  const { data: existing, error } = await supabase
    .from("pricing_settings")
    .select("*")
    .eq("workspace_id", resolvedWorkspaceId)
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
      workspace_id: resolvedWorkspaceId,
      ...DEFAULT_PRICING_SETTINGS,
    })
    .select()
    .single<PricingSettings>();

  if (insertError) {
    throw insertError;
  }

  return inserted;
}
