"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendOutboundSms, type OutboundSmsStatus } from "./sendOutboundSms";

type SendCustomerSmsArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  to: string;
  body: string;
  customerId?: string | null;
  jobId?: string | null;
};

export async function sendCustomerSms({
  supabase,
  workspaceId,
  userId,
  to,
  body,
  customerId,
  jobId,
}: SendCustomerSmsArgs): Promise<OutboundSmsStatus> {
  return sendOutboundSms({
    supabase,
    workspaceId,
    userId,
    to,
    body,
    context: "sendCustomerSms",
    customerId,
    jobId,
  });
}
