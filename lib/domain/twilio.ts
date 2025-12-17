import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizePhone } from "@/utils/phones/normalizePhone";

// No dialing/network calls here; helpers only.
export const TWILIO_STATUS_CALLBACK_EVENTS = ["initiated", "ringing", "answered", "completed"] as const;
export const TWILIO_CALL_STATUS_CALLBACK_PATH = "/api/twilio/calls/status";

export type MachineDetectionConfig = {
  enabled?: boolean;
};

export type DialTwilioCallArgs = {
  toPhone: string;
  fromPhone: string;
  callbackUrl: string;
  metadata: {
    callId: string;
    workspaceId: string;
  };
  machineDetection?: MachineDetectionConfig;
};

export type TwilioDialSuccess = {
  success: true;
  twilioCallSid: string;
  initialStatus: string;
};

export type TwilioDialFailureCode = "twilio_not_configured" | "twilio_provider_error";

export type TwilioDialFailure = {
  success: false;
  code: TwilioDialFailureCode;
  message: string;
  twilioErrorCode?: string;
  twilioErrorMessage?: string;
};

export type TwilioDialResult = TwilioDialSuccess | TwilioDialFailure;

type TwilioWorkspaceRow = {
  id: string;
  owner_id: string | null;
};

export async function findWorkspaceIdByTwilioNumber(
  supabase: SupabaseClient,
  rawNumber?: string | null,
): Promise<{ workspaceId: string; ownerId: string } | null> {
  const normalized = normalizePhone(rawNumber);
  if (!normalized) {
    return null;
  }
  const { data, error } = await supabase
    .from<TwilioWorkspaceRow>("workspaces")
    .select("id, owner_id")
    .eq("business_phone", normalized)
    .maybeSingle();

  if (error) {
    console.error("[twilio-inbound] Failed to resolve workspace by phone", {
      error,
      phone: normalized,
    });
    return null;
  }

  if (!data?.id || !data?.owner_id) {
    return null;
  }

  return {
    workspaceId: data.id,
    ownerId: data.owner_id,
  };
}
