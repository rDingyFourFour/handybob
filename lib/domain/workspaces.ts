"// Workspace domain: centralizes RLS-aware membership resolution via createServerClient. All helpers expect to run with an authenticated user."
"// Entry points: `getCurrentWorkspace`, `requireOwner`, `getWorkspaceProfile`, and slug helpers rely on the current user's workspace membership."
import crypto from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { buildLog } from "@/utils/debug/buildLog";
import { createServerClient } from "@/utils/supabase/server";

buildLog("lib/domain/workspaces module loaded");

export type WorkspaceContext = {
  user: User;
  workspace: { id: string; name: string | null; owner_id: string | null; slug?: string | null };
  role: "owner" | "staff";
};

export type WorkspaceContextResult = {
  user: User | null;
  workspace: WorkspaceContext["workspace"] | null;
  role: WorkspaceContext["role"] | null;
  reason?: "unauthenticated" | "no_membership";
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
  allowAutoCreateWorkspace?: boolean;
};

/**
 * Returns the current user + workspace membership, creating a default workspace
 * if the user has none. Keeps a single source of truth for workspace scoping.
 */
export async function getCurrentWorkspace(
  options: WorkspaceOptions = {}
): Promise<WorkspaceContextResult> {
  // Redirects are forbidden here; route boundaries must decide how to handle auth failures.
  const supabase = options.supabase ?? await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, workspace: null, role: null, reason: "unauthenticated" };
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
    // Membership lookup ensures RLS enforces workspace_id in every downstream query/action. user_id is only used for attribution.
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

  if (options.allowAutoCreateWorkspace === false) {
    return { user, workspace: null, role: null, reason: "no_membership" };
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

export async function requireWorkspaceOrNull(
  options: WorkspaceOptions = {}
): Promise<WorkspaceContextResult> {
  return getCurrentWorkspace(options);
}

// Throw for non-owner roles—used by workspace/automation/pricing config to keep owner-only settings gated.
export function requireOwner(context: WorkspaceContext) {
  if (context.role !== "owner") {
    throw new Error("You don’t have permission to manage workspace settings.");
  }
}

export async function getWorkspaceProfile(options: WorkspaceOptions = {}) {
  const supabase = options.supabase ?? await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });
  if (!workspace) {
    throw new Error("Workspace context unavailable");
  }

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

export type WorkspaceAskBobRow = {
  askbob_enabled?: boolean | null;
};

export function isAskBobEnabledForWorkspaceRow(workspace: WorkspaceAskBobRow): boolean {
  return workspace.askbob_enabled !== false;
}

export async function getAskBobWorkspaceStatus(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ enabled: boolean }> {
  const { data: workspaceRow, error } = await supabase
    .from<WorkspaceAskBobRow>("workspaces")
    .select("askbob_enabled")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("[askbob-status] Failed to query workspace status", {
      workspaceId,
      message: error.message,
    });
    return { enabled: false };
  }

  if (!workspaceRow) {
    return { enabled: false };
  }

  return {
    enabled: isAskBobEnabledForWorkspaceRow(workspaceRow),
  };
}
