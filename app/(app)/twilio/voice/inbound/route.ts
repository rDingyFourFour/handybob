"use server";

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";
import { ensureInboundCallSession } from "@/lib/domain/calls/sessions";
import { findWorkspaceIdByTwilioNumber } from "@/lib/domain/twilio";
import { normalizePhone } from "@/utils/phones/normalizePhone";

const TWIML_RESPONSE = "<Response></Response>";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const callSid = getString(formData, "CallSid");
  const fromValue = getString(formData, "From");
  const toValue = getString(formData, "To");
  const direction = getString(formData, "Direction");
  const callerName = getString(formData, "Caller");
  const normalizedFrom = normalizePhone(fromValue);
  const normalizedTo = normalizePhone(toValue);

  if (!callSid) {
    console.warn("[twilio-inbound-call] Missing CallSid", {
      from: normalizedFrom ?? fromValue,
      to: normalizedTo ?? toValue,
    });
    return buildTwimlResponse();
  }

  const supabase = createAdminClient();
  const workspaceMapping = await findWorkspaceIdByTwilioNumber(supabase, normalizedTo ?? toValue);

  if (!workspaceMapping) {
    console.warn("[twilio-inbound-call-unknown-workspace]", {
      callSid,
      to: normalizedTo ?? toValue,
      from: normalizedFrom ?? fromValue,
      direction,
      caller: callerName,
    });
    return buildTwimlResponse();
  }

  const { workspaceId, ownerId } = workspaceMapping;
  const customerId = await findCustomerByPhone(supabase, workspaceId, normalizedFrom);
  const sessionLabels = {
    workspaceId,
    callSid,
    to: normalizedTo ?? toValue,
    from: normalizedFrom ?? fromValue,
  };

  try {
    const session = await ensureInboundCallSession({
      supabase,
      workspaceId,
      userId: ownerId,
      twilioCallSid: callSid,
      fromNumber: normalizedFrom,
      toNumber: normalizedTo,
      customerId,
    });

    console.log("[twilio-inbound-call-received]", {
      ...sessionLabels,
      matchedCustomer: Boolean(customerId),
      sessionId: session.callId,
    });

    if (customerId) {
      console.log("[twilio-inbound-call-customer-match]", {
        ...sessionLabels,
        customerId,
      });
    } else {
      console.log("[twilio-inbound-call-customer-miss]", sessionLabels);
    }
  } catch (error) {
    console.error("[twilio-inbound-call] Failed to create session", {
      ...sessionLabels,
      workspaceId,
      error,
    });
  }

  return buildTwimlResponse();
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

async function findCustomerByPhone(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  phone: string | null,
) {
  if (!phone) {
    return null;
  }
  const { data, error } = await supabase
    .from<{ id: string }>("customers")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    console.error("[twilio-inbound-call] Failed to match customer by phone", {
      error,
      workspaceId,
      phone,
    });
    return null;
  }

  return data?.id ?? null;
}

function buildTwimlResponse() {
  return new NextResponse(TWIML_RESPONSE, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
