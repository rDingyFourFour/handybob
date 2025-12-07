"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { sendCustomerSms } from "@/lib/domain/sms";

type SendMessagePayload = {
  workspaceId: string;
  customerId: string;
  jobId?: string | null;
  body: string;
  origin?: "inline" | "top-level" | "dialog" | "global";
};

export async function sendCustomerSmsAction({
  workspaceId,
  customerId,
  jobId,
  body,
  origin,
}: SendMessagePayload) {
  const trimmedBody = body?.trim() ?? "";
  const source =
    origin === "top-level"
      ? "topLevel"
      : origin === "inline"
      ? "inline"
      : origin === "global"
      ? "global"
      : "dialog";
  if (!workspaceId || !customerId || !trimmedBody) {
    console.error("[messages-compose-submit] Missing required payload", {
      workspaceId,
      customerId,
      bodyLength: trimmedBody.length,
      source,
    });
    return { ok: false, error: "Missing information for this message." };
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[messages-compose-error] Failed to init Supabase client:", error);
    return { ok: false, error: "Unable to send the message right now." };
  }

  let workspaceContext;
  try {
    workspaceContext = await getCurrentWorkspace({ supabase });
  } catch (error) {
    console.error("[messages-compose-error] Failed to resolve workspace:", error);
    return { ok: false, error: "Unable to send the message right now." };
  }

  const { workspace, user } = workspaceContext;
  if (!workspace || !user) {
    console.error("[messages-compose-error] Missing workspace or user context");
    return { ok: false, error: "Unable to send the message right now." };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, phone")
    .eq("workspace_id", workspace.id)
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    console.error("[messages-compose-error] Failed to load customer:", customerError);
    return { ok: false, error: "Customer lookup failed." };
  }

  if (!customer || !customer.phone?.trim()) {
    console.error("[messages-compose-error] Customer phone missing", { workspaceId, customerId, source });
    return { ok: false, error: "This customer does not have a phone number." };
  }

  console.log("[messages-compose-submit]", {
    workspaceId,
    customerId,
    jobId: jobId ?? null,
    bodyLength: trimmedBody.length,
    source,
  });

  let smsResult;
  try {
    smsResult = await sendCustomerSms({
      supabase,
      workspaceId: workspace.id,
      userId: user.id,
      to: customer.phone.trim(),
      body: trimmedBody,
      customerId,
      jobId: jobId ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[messages-compose-error] Twilio helper failed:", {
      workspaceId,
      customerId,
      error: message,
      source,
    });
    return { ok: false, error: "We couldn’t send this message. Please try again." };
  }

  if (!smsResult.ok) {
    console.error("[messages-compose-error] SMS helper reported failure", {
      workspaceId,
      customerId,
      jobId: jobId ?? null,
      error: smsResult.error,
      source,
    });
    return {
      ok: false,
      error: smsResult.error ?? "The message was not queued. Please try again.",
    };
  }

  console.log("[messages-compose-success]", {
    workspaceId,
    customerId,
    jobId: jobId ?? null,
    sentAt: smsResult.sentAt,
    messageSid: smsResult.messageSid,
    source,
  });

  return { ok: true };
}
