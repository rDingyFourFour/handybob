import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

export type WorkspaceContext = {
  user: User;
  workspace: { id: string; name: string | null; owner_id: string | null };
  role: "owner" | "staff";
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
    .select("role, workspace:workspaces(id, name, owner_id)")
    .eq("user_id", user.id)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.workspace) {
    return {
      user,
      workspace: membership.workspace,
      role: (membership.role as "owner" | "staff") ?? "staff",
    };
  }

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({ owner_id: user.id, name: "My workspace" })
    .select("id, name, owner_id")
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
