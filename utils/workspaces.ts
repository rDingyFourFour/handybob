import crypto from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

export type WorkspaceContext = {
  user: User;
  workspace: { id: string; name: string | null; owner_id: string | null; slug?: string | null };
  role: "owner" | "staff";
};

export type WorkspaceProfile = {
  id: string;
  name: string | null;
  owner_id: string | null;
  slug?: string | null;
  brand_name: string | null;
  brand_tagline: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
};

type WorkspaceOptions = {
  supabase?: SupabaseClient;
};

/**
 * Returns the current user + workspace membership, creating a default workspace
 * if the user has none. Keeps a single source of truth for workspace scoping.
 */
export async function getCurrentWorkspace(
  options: WorkspaceOptions = {}
): Promise<WorkspaceContext> {
  const supabase = options.supabase ?? createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role, workspace:workspaces(id, name, owner_id, slug)")
    .eq("user_id", user.id)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();

  const workspaceRow = Array.isArray(membership?.workspace)
    ? membership?.workspace[0]
    : membership?.workspace;

  if (workspaceRow && membership) {
    // Role meanings:
    // - owner: can manage workspace-level settings (billing, automation, pricing, membership) and all data.
    // - staff: can work with jobs/customers/quotes/invoices/appointments/messages/calls/media but not admin settings.
    return {
      user,
      workspace: workspaceRow as {
        id: string;
        name: string | null;
        owner_id: string | null;
        slug?: string | null;
      },
      role: (membership.role as "owner" | "staff") ?? "staff",
    };
  }

  const slug = await generateUniqueWorkspaceSlug({
    supabase,
    name: "My workspace",
  });

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({ owner_id: user.id, name: "My workspace", slug })
    .select("id, name, owner_id, slug")
    .single();

  if (error || !workspace) {
    throw error ?? new Error("Failed to create default workspace");
  }

  return {
    user,
    workspace,
    role: "owner",
  };
}

export function requireOwner(context: WorkspaceContext) {
  if (context.role !== "owner") {
    throw new Error("You don’t have permission to manage workspace settings.");
  }
}

export async function getWorkspaceProfile(options: WorkspaceOptions = {}) {
  const supabase = options.supabase ?? createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { data } = await supabase
    .from("workspaces")
    .select(
      "id, name, owner_id, slug, brand_name, brand_tagline, business_email, business_phone, business_address"
    )
    .eq("id", workspace.id)
    .maybeSingle<WorkspaceProfile>();

  return (
    data ?? {
      id: workspace.id,
      name: workspace.name,
      owner_id: workspace.owner_id,
      slug: workspace.slug ?? null,
      brand_name: workspace.name,
      brand_tagline: null,
      business_email: null,
      business_phone: null,
      business_address: null,
    }
  );
}

export function slugifyWorkspaceName(name: string | null | undefined) {
  const base = (name || "workspace").toLowerCase();
  const cleaned = base.replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return cleaned || "workspace";
}

export async function generateUniqueWorkspaceSlug({
  supabase,
  name,
}: {
  supabase: SupabaseClient;
  name: string | null | undefined;
}): Promise<string> {
  const base = slugifyWorkspaceName(name);
  const candidates = [base];
  for (let i = 2; i <= 6; i++) {
    candidates.push(`${base}-${i}`);
  }

  for (const candidate of candidates) {
    const { data } = await supabase
      .from("workspaces")
      .select("id")
      .eq("slug", candidate)
      .limit(1);
    if (!data || data.length === 0) {
      return candidate;
    }
  }

  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}
