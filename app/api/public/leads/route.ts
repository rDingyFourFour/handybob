import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { classifyJobWithAi } from "@/lib/domain/jobs";
import { inferAttentionSignals } from "@/lib/domain/calls";
import { runLeadAutomations } from "@/lib/domain/automation";
import { logAuditEvent } from "@/utils/audit/log";
import { createAdminClient } from "@/utils/supabase/admin";

// Public lead capture flow (single source of truth for booking form behavior):
// 1) A visitor opens a workspace-scoped public URL, e.g. /public/workspaces/{slug}/lead.
// 2) They submit name, email, optional phone/address, free-text job description, and desired timing.
// 3) On submit (this handler):
//    - Validate the workspace via the public token and ensure public leads are enabled.
//    - Basic spam checks (honeypot, link filter, rate limit by hashed IP).
//    - Upsert customer inside that workspace (match on email/phone).
//    - Upsert/create a job with status='lead', source='public_form', workspace + customer linked.
//    - Store form metadata in description and log the submission row for abuse review.
//    - Run AI classification/urgency (existing helper) and, if emergency, fire automations (email/SMS alerts).
//    - Write an audit log entry for the lead creation.
// This aligns with the product spec for public booking/lead intake and should be mirrored in docs/internal/public-leads.md.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_MINUTES = 15;
const RATE_LIMIT_MAX = 4;

type WorkspaceRow = {
  id: string;
  owner_id: string;
  name: string | null;
  brand_name: string | null;
  slug: string;
  public_lead_form_enabled?: boolean | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const input = await parsePayload(req);

  if (!input) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const {
    workspaceSlug,
    name,
    email,
    phone,
    description,
    address,
    urgency,
    preferredTime,
    honeypot,
    specificDate,
  } = input;

  const workspace = await resolveWorkspace(supabase, workspaceSlug);
  if (!workspace) {
    return NextResponse.json({ error: "This form is not available." }, { status: 404 });
  }
  if (workspace.public_lead_form_enabled === false) {
    return NextResponse.json({ error: "Lead capture for this workspace is disabled." }, { status: 403 });
  }

  const cleanedDescription = (description || "").trim();
  if (!cleanedDescription || cleanedDescription.length < 10) {
    return NextResponse.json({ error: "Please share a bit more about the job (at least 10 characters)." }, { status: 400 });
  }

  if (!name || (!email && !phone)) {
    return NextResponse.json({ error: "Name plus either email or phone is required." }, { status: 400 });
  }

  const clientIp = getClientIp(req);
  const ipHash = clientIp ? hashValue(clientIp) : null;
  const userAgent = req.headers.get("user-agent") ?? null;
  const honeypotHit = Boolean(honeypot && honeypot.trim().length > 0);

  const rateLimited = await checkRateLimit(supabase, workspace.id, ipHash);
  if (rateLimited) {
    await logSubmission(supabase, {
      workspaceId: workspace.id,
      ipHash,
      userAgent,
      blockedReason: "rate_limited",
      honeypotTripped: honeypotHit,
    });
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 }
    );
  }

  if (honeypotHit || containsSuspiciousLinks(cleanedDescription)) {
    await logSubmission(supabase, {
      workspaceId: workspace.id,
      ipHash,
      userAgent,
      blockedReason: honeypotHit ? "honeypot" : "link_filter",
      honeypotTripped: honeypotHit,
    });
    // Respond success to avoid teaching bots about the honeypot.
    return NextResponse.json({ ok: true, accepted: true });
  }

  try {
    // Sequence (happy path): normalize payload -> resolve workspace by slug (scopes workspace_id) -> enforce public_lead_form_enabled -> spam checks (honeypot, link filter, rate limit) -> upsert customer scoped to workspace -> insert lead job scoped to workspace -> log submission -> AI classify job -> trigger automations if emergency -> audit log entry.
    // Failure modes: invalid input, disabled form, spam/rate limits, DB errors during upsert/insert, AI/automation failures (non-blocking) all return 4xx/5xx or early OK for honeypot to avoid teaching bots.
    const urgencyNormalized = normalizeUrgency(urgency);
    const mergedDescription = buildDescription(cleanedDescription, {
      address,
      preferredTime: preferredTime || specificDate || null,
      name,
      email,
      phone,
    });

    const signals = inferAttentionSignals({
      text: mergedDescription,
      summary: cleanedDescription,
      direction: "inbound",
      status: "web",
      hasJob: false,
    });

    const customer = await upsertCustomer(supabase, workspace, { name, email, phone });
    const jobId = await upsertLead(supabase, workspace, customer, {
      description: mergedDescription,
      urgency: urgencyNormalized,
      category: signals.category,
      priority: signals.priority,
      attentionScore: signals.attentionScore,
      attentionReason: signals.reason,
    });

    await logSubmission(supabase, {
      workspaceId: workspace.id,
      customerId: customer?.id ?? null,
      jobId,
      ipHash,
      userAgent,
      honeypotTripped: false,
      blockedReason: null,
    });

    const classification = await classifyJobWithAi({
      jobId,
      userId: workspace.owner_id,
      workspaceId: workspace.id,
      title: buildTitle(cleanedDescription),
      description: mergedDescription,
    });

    if (classification?.ai_urgency === "emergency") {
      await runLeadAutomations({
        userId: workspace.owner_id,
        workspaceId: workspace.id,
        jobId,
        title: buildTitle(cleanedDescription),
        customerName: customer?.name ?? null,
        summary: mergedDescription,
        aiUrgency: classification.ai_urgency,
      });
    }

    await logAuditEvent({
      supabase,
      workspaceId: workspace.id,
      actorUserId: workspace.owner_id,
      action: "job_created",
      entityType: "job",
      entityId: jobId,
      metadata: { source: "public_form" },
    });

    return NextResponse.json({ ok: true, jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[public-lead] Failed to save submission:", message);

    await logSubmission(supabase, {
      workspaceId: workspace.id,
      ipHash,
      userAgent,
      blockedReason: "error",
      honeypotTripped: false,
    });

    return NextResponse.json(
      { error: "We could not save your request right now. Please try again." },
      { status: 500 },
    );
  }
}

async function parsePayload(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const body = await req.json();
      return normalizePayload(body);
    } catch {
      return null;
    }
  }

  if (contentType.includes("form-urlencoded") || contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const entries = Object.fromEntries(form.entries());
      return normalizePayload(entries);
    } catch {
      return null;
    }
  }

  return null;
}

function normalizePayload(raw: Record<string, FormDataEntryValue | null>) {
  const pick = (key: string) => {
    const value = raw?.[key];
    return typeof value === "string" ? value.trim() : null;
  };

  const workspaceSlug = pick("workspaceSlug") ?? pick("workspace_slug");
  if (!workspaceSlug) return null;

  const payload: {
    workspaceSlug: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    description: string | null;
    address: string | null;
    urgency: string | null;
    preferredTime: string | null;
    specificDate: string | null;
    honeypot: string | null;
  } = {
    workspaceSlug,
    name: pick("name"),
    email: pick("email"),
    phone: pick("phone"),
    description: pick("description"),
    address: pick("address"),
    urgency: pick("urgency"),
    preferredTime: pick("preferred_time") ?? pick("preferredTime"),
    specificDate: pick("specific_date"),
    honeypot: pick("website") ?? pick("company"),
  };

  return payload;
}

async function resolveWorkspace(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceSlug: string
) {
  const { data } = await supabase
    .from("workspaces")
    .select("id, owner_id, name, slug, brand_name, public_lead_form_enabled")
    .eq("slug", workspaceSlug)
    .maybeSingle<WorkspaceRow>();

  return data ?? null;
}

async function checkRateLimit(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  ipHash: string | null,
) {
  if (!ipHash) return false;

  const windowStart = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("lead_form_submissions")
    .select("id", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("ip_hash", ipHash)
    .gte("created_at", windowStart);

  if (error) {
    console.warn("[public-lead] rate limit check failed:", error.message);
    return false;
  }

  return typeof count === "number" && count >= RATE_LIMIT_MAX;
}

async function upsertCustomer(
  supabase: ReturnType<typeof createAdminClient>,
  workspace: WorkspaceRow,
  contact: { name: string | null; email: string | null; phone: string | null },
) {
  const email = contact.email?.toLowerCase() || null;
  const phone = contact.phone?.trim() || null;

  const filters = [];
  if (email) filters.push(`email.ilike.${email}`);
  if (phone) filters.push(`phone.eq.${phone}`);

  let existing: CustomerRow | null = null;
  if (filters.length > 0) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("workspace_id", workspace.id)
      .or(filters.join(","))
      .limit(1);
    existing = (data?.[0] as CustomerRow | undefined) ?? null;
  }

  if (existing) {
    const update: Partial<CustomerRow> = {
      name: existing.name || contact.name || null,
      email: existing.email || email,
      phone: existing.phone || phone,
    };

    await supabase
      .from("customers")
      .update(update)
      .eq("id", existing.id)
      .eq("workspace_id", workspace.id);

    return { ...existing, ...update };
  }

  const { data: inserted, error } = await supabase
    .from("customers")
    .insert({
      user_id: workspace.owner_id,
      workspace_id: workspace.id,
      name: contact.name,
      email,
      phone,
    })
    .select("id, name, email, phone")
    .single();

  if (error) {
    console.warn("[public-lead] Failed to create customer:", error.message);
    return existing;
  }

  return inserted as CustomerRow;
}

async function upsertLead(
  supabase: ReturnType<typeof createAdminClient>,
  workspace: WorkspaceRow,
  customer: CustomerRow | null,
  job: {
    description: string;
    urgency: string;
    category: string | null;
    priority: string | null;
    attentionScore: number;
    attentionReason: string;
  },
) {
  const openJob = await findOpenLeadForCustomer(supabase, workspace.id, customer?.id);
  const title = buildTitle(job.description);

  if (openJob) {
    const { error } = await supabase
      .from("jobs")
      .update({
        title: openJob.title || title,
        description_raw: job.description,
        urgency: job.urgency,
        category: job.category ?? null,
        priority: job.priority ?? "normal",
        attention_score: job.attentionScore,
        attention_reason: job.attentionReason,
      })
      .eq("id", openJob.id)
      .eq("workspace_id", workspace.id);

    if (error) {
      console.warn("[public-lead] Failed to update existing lead:", error.message);
    }

    return openJob.id;
  }

  const { data: inserted, error } = await supabase
    .from("jobs")
    .insert({
      user_id: workspace.owner_id,
      workspace_id: workspace.id,
      customer_id: customer?.id ?? null,
      title,
      description_raw: job.description,
      urgency: job.urgency,
      category: job.category ?? null,
      priority: job.priority ?? "normal",
      attention_score: job.attentionScore,
      attention_reason: job.attentionReason,
      status: "lead",
      source: "public_form",
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    throw new Error(error?.message || "Failed to create lead");
  }

  return inserted.id as string;
}

async function findOpenLeadForCustomer(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  customerId: string | null | undefined,
) {
  if (!customerId) return null;

  const CLOSED = ["completed", "cancelled", "closed", "lost", "done"];
  const { data } = await supabase
    .from("jobs")
    .select("id, status, title")
    .eq("workspace_id", workspaceId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(5);

  const jobs = (data ?? []) as { id: string; status: string | null; title: string | null }[];
  return jobs.find((job) => {
    const status = (job.status || "").toLowerCase();
    return !CLOSED.includes(status) && status === "lead";
  }) ?? null;
}

async function logSubmission(
  supabase: ReturnType<typeof createAdminClient>,
  entry: {
    workspaceId: string;
    customerId?: string | null;
    jobId?: string | null;
    ipHash: string | null;
    userAgent: string | null;
    blockedReason: string | null;
    honeypotTripped: boolean;
  },
) {
  const { error } = await supabase.from("lead_form_submissions").insert({
    workspace_id: entry.workspaceId,
    customer_id: entry.customerId ?? null,
    job_id: entry.jobId ?? null,
    ip_hash: entry.ipHash,
    user_agent: entry.userAgent,
    blocked_reason: entry.blockedReason,
    honeypot_tripped: entry.honeypotTripped,
  });

  if (error) {
    console.warn("[public-lead] Failed to log submission:", error.message);
  }
}

function buildDescription(
  description: string,
  extras: { address: string | null; preferredTime: string | null; name: string | null; email: string | null; phone: string | null },
) {
  const lines = [
    description,
    extras.address ? `Address: ${extras.address}` : null,
    extras.preferredTime ? `Preferred timing: ${extras.preferredTime}` : null,
    extras.name || extras.email || extras.phone
      ? `Contact: ${[extras.name, extras.email, extras.phone].filter(Boolean).join(" • ")}`
      : null,
  ].filter(Boolean);

  return lines.join("\n\n");
}

function buildTitle(description: string) {
  const condensed = description.replace(/\s+/g, " ").trim();
  return condensed.slice(0, 80) || "Lead";
}

function getClientIp(req: NextRequest) {
  const header = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";
  return header.split(",").map((v) => v.trim()).find(Boolean) || null;
}

function hashValue(value: string) {
  const salt = process.env.LEAD_FORM_IP_SALT || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return crypto.createHash("sha256").update(`${value}:${salt}`).digest("hex");
}

function normalizeUrgency(raw: string | null) {
  const value = (raw || "").toLowerCase();
  if (["today", "this_week", "flexible"].includes(value)) return value;
  if (value === "asap" || value === "emergency") return "today";
  return "flexible";
}

function containsSuspiciousLinks(text: string) {
  const urlMatches = text.match(/https?:\/\//gi);
  return Boolean(urlMatches && urlMatches.length > 2);
}
