import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizePhone } from "@/utils/phones/normalizePhone";

export type PublicLeadWorkspace = {
  id: string;
  owner_id: string;
};

export type PublicLeadCustomer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
};

type PublicLeadCustomerInput = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
};

type PublicLeadJobInput = {
  description: string;
  title?: string | null;
  urgency?: string | null;
  category?: string | null;
  priority?: string | null;
  attentionScore?: number | null;
  attentionReason?: string | null;
  source: string;
  spamSuspected?: boolean | null;
};

const CLOSED_JOB_STATUSES = ["completed", "cancelled", "closed", "lost", "done"];
const DEFAULT_ATTENTION_SCORE = 0;

export function buildPublicLeadTitle(description: string) {
  const condensed = description.replace(/\s+/g, " ").trim();
  if (!condensed) return "Lead";
  return condensed.length > 80 ? `${condensed.slice(0, 77)}...` : condensed;
}

export function buildPublicLeadDescription(
  description: string,
  extras: {
    address?: string | null;
    preferredTime?: string | null;
    specificDate?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  },
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

export function normalizePublicLeadUrgency(raw?: string | null) {
  const value = (raw || "").toLowerCase();
  if (value === "today") return "today";
  if (value === "this_week") return "this_week";
  if (value === "flexible") return "flexible";
  if (value === "next_week") return "next_week";
  if (value === "asap" || value === "emergency") return "today";
  return "flexible";
}

export async function upsertPublicLeadCustomer(params: {
  supabase: SupabaseClient;
  workspace: PublicLeadWorkspace;
  contact: PublicLeadCustomerInput;
}): Promise<PublicLeadCustomer | null> {
  const { supabase, workspace, contact } = params;
  const email = contact.email?.toLowerCase() || null;
  const phone = normalizePhone(contact.phone);

  const filters = [];
  if (email) filters.push(`email.ilike.${email}`);
  if (phone) filters.push(`phone.eq.${phone}`);

  let existing: PublicLeadCustomer | null = null;
  if (filters.length > 0) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, email, phone, address")
      .eq("workspace_id", workspace.id)
      .or(filters.join(","))
      .limit(1);
    existing = (data?.[0] as PublicLeadCustomer | undefined) ?? null;
  }

  if (existing) {
    const update: Partial<PublicLeadCustomer> = {
      name: existing.name || contact.name || null,
      email: existing.email || email || null,
      phone: existing.phone || phone,
      address: existing.address || contact.address || null,
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
      name: contact.name,
      email,
      phone,
      address: contact.address ?? null,
    })
    .select("id, name, email, phone, address")
    .single();

  if (error) {
    console.warn("[public-lead] Failed to create customer:", error.message);
    return null;
  }

  return inserted as PublicLeadCustomer;
}

export async function upsertPublicLeadJob(params: {
  supabase: SupabaseClient;
  workspace: PublicLeadWorkspace;
  customerId?: string | null;
  job: PublicLeadJobInput;
}): Promise<{ jobId: string; wasUpdated: boolean }> {
  const { supabase, workspace, customerId, job } = params;
  const openJob = await findOpenLeadForCustomer(supabase, workspace.id, customerId);
  const title = job.title?.trim() || buildPublicLeadTitle(job.description);
  const resolvedAttentionScore = job.attentionScore ?? DEFAULT_ATTENTION_SCORE;

  if (openJob) {
    const updatePayload: Record<string, unknown> = {
      title: openJob.title || title,
      description_raw: job.description,
      urgency: job.urgency ?? null,
      category: job.category ?? null,
      customer_id: openJob.customer_id ?? customerId ?? null,
    };

    if (job.attentionScore != null) {
      updatePayload.attention_score = job.attentionScore;
    }
    if (job.attentionReason != null) {
      updatePayload.attention_reason = job.attentionReason;
    }
    if (job.priority != null) {
      updatePayload.priority = job.priority;
    }
    if (job.spamSuspected != null) {
      updatePayload.spam_suspected = job.spamSuspected;
    }

    const { error } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", openJob.id)
      .eq("workspace_id", workspace.id);

    if (error) {
      console.warn("[public-lead] Failed to update existing lead:", error.message);
    }

    return { jobId: openJob.id, wasUpdated: true };
  }

  const insertPayload: Record<string, unknown> = {
    user_id: workspace.owner_id,
    workspace_id: workspace.id,
    customer_id: customerId ?? null,
    title,
    description_raw: job.description,
    status: "lead",
    source: job.source,
    urgency: job.urgency ?? null,
    category: job.category ?? null,
    attention_score: resolvedAttentionScore,
    attention_reason: job.attentionReason ?? null,
    spam_suspected: job.spamSuspected ?? null,
  };

  if (job.priority != null) {
    insertPayload.priority = job.priority;
  }

  const { data: inserted, error } = await supabase
    .from("jobs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !inserted?.id) {
    throw new Error(error?.message || "Failed to create lead");
  }

  return { jobId: inserted.id as string, wasUpdated: false };
}

async function findOpenLeadForCustomer(
  supabase: SupabaseClient,
  workspaceId: string,
  customerId: string | null | undefined,
) {
  if (!customerId) return null;

  const { data } = await supabase
    .from("jobs")
    .select("id, status, title, customer_id")
    .eq("workspace_id", workspaceId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(5);

  const jobs = (data ?? []) as {
    id: string;
    status: string | null;
    title: string | null;
    customer_id: string | null;
  }[];
  return jobs.find((job) => {
    const status = (job.status || "").toLowerCase();
    return !CLOSED_JOB_STATUSES.includes(status) && status === "lead";
  }) ?? null;
}
