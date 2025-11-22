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
import { classifyJobWithAi } from "@/utils/ai/classifyJob";
import { runLeadAutomations } from "@/utils/automation/runLeadAutomations";
import { sendCustomerMessageEmail } from "@/utils/email/sendCustomerMessage";

export type ActionState = {
  status: "idle" | "error" | "success";
  errors?: Partial<Record<"name" | "email" | "description", string>>;
  message?: string | null;
  successName?: string | null;
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

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
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

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const phone = (formData.get("phone") as string | null)?.trim() || "";
  const address = (formData.get("address") as string | null)?.trim() || "";
  const description = (formData.get("description") as string | null)?.trim() ?? "";
  const urgencyRaw = (formData.get("urgency") as string | null)?.trim() || "this_week";
  const specificDate = (formData.get("specific_date") as string | null)?.trim() || "";
  const preferredTime = (formData.get("preferred_time") as string | null)?.trim() || "";
  const honeypot = (formData.get("website") as string | null)?.trim() || "";

  const errors: ActionState["errors"] = {};
  if (!name) errors.name = "Name is required.";
  if (!email) errors.email = "Email is required.";
  if (!description) errors.description = "Please describe the work.";
  const spamSuspected = Boolean(honeypot);

  if (Object.keys(errors).length > 0) {
    return { status: "error", errors };
  }

  const supabase = createAdminClient();

  // Rate-limit repeat submissions from the same IP fingerprint.
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, owner_id, slug, name, brand_name, public_lead_form_enabled, auto_confirmation_email_enabled")
    .eq("slug", workspaceSlug)
    .maybeSingle<WorkspaceRow>();

  if (!workspace || workspace.public_lead_form_enabled === false) {
    return { status: "error", message: "This booking link is not active." };
  }

  if (await isRateLimited(supabase, workspace.id, ipHash)) {
    await logSubmission(supabase, {
      workspaceId: workspace.id,
      ipHash,
      userAgent,
      blockedReason: "rate_limited",
    });
    return { status: "error", message: "Something went wrong, please try again later." };
  }

  const customer = await findOrCreateCustomer({
    supabase,
    workspace,
    name,
    email,
    phone,
    address,
  });

  if (!customer) {
    return { status: "error", message: "We could not save your request. Please try again." };
  }

  const mergedDescription = buildDescription(description, { address, preferredTime, specificDate, name, email, phone });
  const jobTitle = buildTitle(description);
  const urgency = normalizeUrgency(urgencyRaw, specificDate);

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      user_id: workspace.owner_id,
      workspace_id: workspace.id,
      customer_id: customer.id,
      title: jobTitle,
      description_raw: mergedDescription,
      status: "lead",
      source: "web_form",
      urgency,
      spam_suspected: spamSuspected,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[public-booking] Failed to create job:", error.message);
    return { status: "error", message: "We could not save your request. Please try again." };
  }

  await logSubmission(supabase, {
    workspaceSlug,
    workspaceId: workspace.id,
    customerId: customer.id,
    jobId: job?.id ?? null,
    ipHash,
    userAgent,
    blockedReason: spamSuspected ? "honeypot" : null,
  });

  if (spamSuspected) {
    return { status: "success" }; // silently drop bots without leaking details
  }

  // AI classification (best-effort, non-blocking)
  if (job?.id) {
    try {
      const classification = await classifyJobWithAi({
        jobId: job.id,
        userId: workspace.owner_id,
        workspaceId: workspace.id,
        title: jobTitle,
        description: `${mergedDescription}\n\nTiming: ${urgency}${specificDate ? `, date: ${specificDate}` : ""}`,
      });

      if (classification?.ai_urgency?.toLowerCase() === "emergency") {
        await runLeadAutomations({
          userId: workspace.owner_id,
          workspaceId: workspace.id,
          jobId: job.id,
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
  return { status: "success", successName: firstName };
}

async function findOrCreateCustomer({
  supabase,
  workspace,
  name,
  email,
  phone,
  address,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  workspace: WorkspaceRow;
  name: string;
  email: string;
  phone: string;
  address: string;
}) {
  const filters = [];
  const normalizedEmail = email.toLowerCase();
  const normalizedPhone = phone || null;
  if (normalizedEmail) filters.push(`email.ilike.${normalizedEmail}`);
  if (normalizedPhone) filters.push(`phone.eq.${normalizedPhone}`);

  let existing: CustomerRow | null = null;
  if (filters.length > 0) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, email, phone, address")
      .eq("workspace_id", workspace.id)
      .or(filters.join(","))
      .limit(1);
    existing = (data?.[0] as CustomerRow | undefined) ?? null;
  }

  if (existing) {
    const update: Partial<CustomerRow> = {
      name: existing.name || name || null,
      email: existing.email || normalizedEmail || null,
      phone: existing.phone || normalizedPhone,
      address: existing.address || address || null,
    };

    await supabase
      .from("customers")
      .update(update)
      .eq("id", existing.id)
      .eq("workspace_id", workspace.id);

    return { ...existing, ...update, id: existing.id };
  }

  const { data: inserted, error } = await supabase
    .from("customers")
    .insert({
      user_id: workspace.owner_id,
      workspace_id: workspace.id,
      name,
      email: normalizedEmail || null,
      phone: normalizedPhone,
      address: address || null,
    })
    .select("id, name, email, phone, address")
    .single();

  if (error) {
    console.warn("[public-booking] Failed to create customer:", error.message);
    return null;
  }

  return inserted as CustomerRow;
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
  }).catch(() => null);
}

function buildTitle(description: string) {
  const condensed = description.replace(/\s+/g, " ").trim();
  if (!condensed) return "Website inquiry";
  return condensed.length > 80 ? `${condensed.slice(0, 77)}...` : condensed;
}

function buildDescription(
  description: string,
  extras: { address: string; preferredTime: string; specificDate: string; name: string; email: string; phone: string },
) {
  const lines = [
    description,
    extras.address ? `Address: ${extras.address}` : null,
    extras.specificDate ? `Requested date: ${extras.specificDate}` : null,
    extras.preferredTime ? `Preferred time: ${extras.preferredTime}` : null,
    [extras.name, extras.email, extras.phone].some(Boolean)
      ? `Contact: ${[extras.name, extras.email, extras.phone].filter(Boolean).join(" • ")}`
      : null,
  ].filter(Boolean);

  return lines.join("\n\n");
}

function normalizeUrgency(raw: string, specificDate: string) {
  const value = raw.toLowerCase();
  if (value === "today") return "today";
  if (value === "this_week") return "this_week";
  if (value === "flexible") return "flexible";
  if (value === "specific_date" && specificDate) return "flexible";
  return "flexible";
}

function getClientIp(h: Awaited<ReturnType<typeof headers>>) {
  const header = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "";
  return header.split(",").map((v) => v.trim()).find(Boolean) || null;
}

function hashValue(value: string) {
  const salt = process.env.LEAD_FORM_IP_SALT || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return crypto.createHash("sha256").update(`${value}:${salt}`).digest("hex");
}
