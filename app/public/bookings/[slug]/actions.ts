"use server";

// Security/multi-tenant notes:
// - Public requests carry only the workspace slug. We resolve the workspace first, then scope ALL writes by workspace_id.
// - If the public form is disabled, we abort before any customer/job insert.
// - No workspace member data is returned to the client; responses are generic and ID-free.
// - Spam controls: honeypot + hashed-IP rate limit; optional CAPTCHA can be added here before inserts.
// - lead_form_submissions is used for abuse audit (workspace_id + ip_hash) without exposing internal details.

import crypto from "crypto";
import { headers } from "next/headers";

import { createAdminClient } from "@/utils/supabase/admin";
import { classifyJobWithAi } from "@/lib/domain/jobs";
import { runLeadAutomations } from "@/lib/domain/automation";
import { sendCustomerMessageEmail } from "@/utils/email/sendCustomerMessage";
import { validatePublicLeadSubmission } from "@/schemas/publicLead";
import {
  buildPublicLeadDescription,
  buildPublicLeadTitle,
  normalizePublicLeadUrgency,
  upsertPublicLeadCustomer,
  upsertPublicLeadJob,
} from "@/lib/domain/publicLeads";
import { createServerClient } from "@/utils/supabase/server";

export type ActionState = {
  status: "idle" | "error" | "success";
  errors?: Partial<Record<"name" | "email" | "description", string>>;
  message?: string | null;
  successName?: string | null;
  jobId?: string | null;
  customerId?: string | null;
  redirectTo?: string | null;
  errorCode?: string | null;
};

type WorkspaceRow = {
  id: string;
  owner_id: string;
  slug: string;
  name: string | null;
  brand_name: string | null;
  public_lead_form_enabled?: boolean | null;
  auto_confirmation_email_enabled?: boolean | null;
};

export async function submitPublicBooking(
  workspaceSlug: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const ipHash = ip ? hashValue(ip) : null;
  const userAgent = hdrs.get("user-agent") ?? null;

  const formValues = Object.fromEntries(formData.entries()) as Record<string, FormDataEntryValue>;
  const normalizedInput = Object.fromEntries(
    Object.entries(formValues).map(([key, value]) => [
      key,
      typeof value === "string" ? value : null,
    ]),
  ) as Record<string, string | null | undefined>;

  const validation = validatePublicLeadSubmission({
    ...normalizedInput,
    workspaceSlug,
    honeypot: normalizedInput.website ?? normalizedInput.honeypot ?? null,
  });

  if (!validation.success) {
    console.warn("[public-booking-submit]", {
      status: "error",
      errorCode: "invalid_input",
      workspaceSlug,
    });
    return { status: "error", message: validation.error, errorCode: "invalid_input" };
  }

  const {
    name,
    email,
    phone,
    address,
    description,
    urgency: selectedUrgency,
    preferredTime,
    specificDate,
    honeypot,
  } = validation.data;
  const contactAddress = address ?? "";
  const contactPreferredTime = preferredTime ?? "";
  const contactSpecificDate = specificDate ?? "";
  const spamSuspected = Boolean(honeypot);

  const supabase = createAdminClient();

  // Rate-limit repeat submissions from the same IP fingerprint.
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, owner_id, slug, name, brand_name, public_lead_form_enabled, auto_confirmation_email_enabled")
    .eq("slug", workspaceSlug)
    .maybeSingle<WorkspaceRow>();

  if (!workspace || workspace.public_lead_form_enabled === false) {
    console.warn("[public-booking-submit]", {
      status: "error",
      errorCode: "inactive_form",
      workspaceSlug,
    });
    return { status: "error", message: "This booking link is not active.", errorCode: "inactive_form" };
  }

  if (await isRateLimited(supabase, workspace.id, ipHash)) {
    await logSubmission(supabase, {
      workspaceId: workspace.id,
      ipHash,
      userAgent,
      blockedReason: "rate_limited",
    });
    console.warn("[public-booking-submit]", {
      status: "error",
      errorCode: "rate_limited",
      workspaceId: workspace.id,
    });
    return {
      status: "error",
      message: "Something went wrong, please try again later.",
      errorCode: "rate_limited",
    };
  }

  const customer = await upsertPublicLeadCustomer({
    supabase,
    workspace,
    contact: {
      name,
      email,
      phone,
      address: contactAddress,
    },
  });

  if (!customer) {
    console.warn("[public-booking-submit]", {
      status: "error",
      errorCode: "customer_create_failed",
      workspaceId: workspace.id,
    });
    return {
      status: "error",
      message: "We could not save your request. Please try again.",
      errorCode: "customer_create_failed",
    };
  }

  const mergedDescription = buildPublicLeadDescription(description, {
    address: contactAddress,
    preferredTime: contactPreferredTime || null,
    specificDate: contactSpecificDate || null,
    name,
    email,
    phone,
  });
  const jobTitle = buildPublicLeadTitle(description);
  const normalizedUrgency = normalizePublicLeadUrgency(
    selectedUrgency === "specific_date" && contactSpecificDate ? "flexible" : selectedUrgency,
  );

  let jobId: string | null = null;
  try {
    const jobResult = await upsertPublicLeadJob({
      supabase,
      workspace,
      customerId: customer.id,
      job: {
        description: mergedDescription,
        title: jobTitle,
        urgency: normalizedUrgency,
        source: "web_form",
        spamSuspected,
      },
    });
    jobId = jobResult.jobId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.warn("[public-booking] Failed to create job:", message);
    console.warn("[public-booking-submit]", {
      status: "error",
      errorCode: "job_create_failed",
      workspaceId: workspace.id,
      customerId: customer.id,
    });
    return {
      status: "error",
      message: "We could not save your request. Please try again.",
      errorCode: "job_create_failed",
    };
  }

  await logSubmission(supabase, {
    workspaceId: workspace.id,
    customerId: customer.id,
    jobId,
    ipHash,
    userAgent,
    blockedReason: spamSuspected ? "honeypot" : null,
  });

  if (spamSuspected) {
    console.log("[public-booking-submit]", {
      status: "success",
      workspaceId: workspace.id,
      jobId: null,
      customerId: null,
      spamSuspected: true,
    });
    return { status: "success" };
  }

  // AI classification (best-effort, non-blocking)
  if (jobId) {
    try {
      const classification = await classifyJobWithAi({
        jobId,
        userId: workspace.owner_id,
        workspaceId: workspace.id,
        title: jobTitle,
        description: `${mergedDescription}\n\nTiming: ${normalizedUrgency}${specificDate ? `, date: ${specificDate}` : ""}`,
      });

      if (classification?.ai_urgency?.toLowerCase() === "emergency") {
        await runLeadAutomations({
          userId: workspace.owner_id,
          workspaceId: workspace.id,
          jobId,
          title: jobTitle,
          customerName: customer.name ?? null,
          summary: mergedDescription,
          aiUrgency: classification.ai_urgency,
        });
      }
    } catch (err) {
      console.warn("[public-booking] AI classification failed:", err instanceof Error ? err.message : err);
    }
  }

  if (!spamSuspected && workspace.auto_confirmation_email_enabled && email) {
    const workspaceName = workspace.brand_name || workspace.name || "Your contractor";
    const firstName = name.split(" ")[0] || name;
    const body = [
      `Hi ${firstName},`,
      "",
      `Thanks for reaching out to ${workspaceName}. We received your request and will follow up soon.`,
      "We usually respond within a few business hours. If this is urgent, feel free to reply to this email.",
      "",
      "— HandyBob",
    ].join("\n");

    sendCustomerMessageEmail({
      to: email,
      subject: `${workspaceName}: we received your request`,
      body,
    }).catch((err) => {
      console.warn("[public-booking] Failed to send confirmation email:", err instanceof Error ? err.message : err);
    });
  }

  const firstName = name.split(" ")[0] || name;
  let redirectTo: string | null = null;
  try {
    const authSupabase = await createServerClient();
    const { data } = await authSupabase.auth.getUser();
    if (data?.user?.id && data.user.id === workspace.owner_id && jobId) {
      redirectTo = `/jobs/${jobId}`;
    }
  } catch (error) {
    console.warn("[public-booking] Failed to resolve session:", error instanceof Error ? error.message : error);
  }

  console.log("[public-booking-submit]", {
    status: "success",
    workspaceId: workspace.id,
    jobId,
    customerId: customer.id,
  });

  return {
    status: "success",
    successName: firstName,
    jobId,
    customerId: customer.id,
    redirectTo,
  };
}

async function isRateLimited(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  ipHash: string | null
) {
  if (!ipHash) return false;
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("lead_form_submissions")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("ip_hash", ipHash)
    .gte("created_at", windowStart);
  return typeof count === "number" && count >= 5;
}

async function logSubmission(
  supabase: ReturnType<typeof createAdminClient>,
  entry: {
    workspaceId?: string | null;
    customerId?: string | null;
    jobId?: string | null;
    ipHash: string | null;
    userAgent: string | null;
    blockedReason: string | null;
  },
) {
  await supabase.from("lead_form_submissions").insert({
    workspace_id: entry.workspaceId ?? null,
    customer_id: entry.customerId ?? null,
    job_id: entry.jobId ?? null,
    ip_hash: entry.ipHash,
    user_agent: entry.userAgent,
    blocked_reason: entry.blockedReason,
    honeypot_tripped: entry.blockedReason === "honeypot",
  });
}

function getClientIp(h: Awaited<ReturnType<typeof headers>>) {
  const header = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "";
  return header.split(",").map((v) => v.trim()).find(Boolean) || null;
}

function hashValue(value: string) {
  const salt = process.env.LEAD_FORM_IP_SALT || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return crypto.createHash("sha256").update(`${value}:${salt}`).digest("hex");
}
