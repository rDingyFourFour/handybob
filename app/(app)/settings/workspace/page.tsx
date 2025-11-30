export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type WorkspaceDetail = {
  id: string;
  name: string | null;
  owner_id: string | null;
  slug: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fallbackCard(title: string, body: string) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <HbButton as="a" href="/dashboard" size="sm">
          Back to dashboard
        </HbButton>
      </HbCard>
    </div>
  );
}

function renderSettingsErrorCard() {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">Something went wrong</h1>
        <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        <HbButton as="a" href="/dashboard" size="sm">
          Back to dashboard
        </HbButton>
      </HbCard>
    </div>
  );
}

export default async function WorkspaceSettingsPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[settings/workspace] Failed to init Supabase client:", error);
    return renderSettingsErrorCard();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
    return null;
  }

  let workspaceContext;
  try {
    workspaceContext = await getCurrentWorkspace({ supabase });
  } catch (error) {
    console.error("[settings/workspace] Failed to resolve workspace:", error);
    return renderSettingsErrorCard();
  }

  const { workspace } = workspaceContext;

  let workspaceRow: WorkspaceDetail | null = null;
  try {
    const { data, error } = await supabase
      .from<WorkspaceDetail>("workspaces")
      .select("id, name, owner_id, slug, created_at, updated_at")
      .eq("id", workspace.id)
      .maybeSingle();

    if (error) {
      console.error("[settings/workspace] Failed to load workspace details:", error);
    } else {
      workspaceRow = data ?? null;
    }
  } catch (error) {
    console.error("[settings/workspace] Failed to load workspace details:", error);
  }

  if (!workspaceRow) {
    return fallbackCard(
      "Workspace not found",
      "We couldn’t load your workspace details."
    );
  }

  const createdLabel = formatDate(workspaceRow.created_at);
  const updatedLabel = formatDate(workspaceRow.updated_at);
  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="hb-heading-2 text-2xl font-semibold text-slate-100">Workspace settings</h1>
          <p className="text-sm text-slate-400">
            This is your HandyBob workspace. Future features will let you edit details here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HbButton as="a" href="/dashboard" size="sm">
            Back to dashboard
          </HbButton>
          <HbButton as="a" href="/settings/profile" variant="ghost" size="sm">
            Back to settings
          </HbButton>
        </div>
      </div>
      <HbCard className="space-y-4">
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            <span className="font-semibold text-slate-100">Workspace name:</span> {workspaceRow.name ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-slate-100">Slug:</span> {workspaceRow.slug ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-slate-100">Owner:</span> {workspaceRow.owner_id ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-slate-100">Created:</span> {createdLabel}
          </p>
          <p>
            <span className="font-semibold text-slate-100">Updated:</span> {updatedLabel}
          </p>
        </div>
      </HbCard>
    </div>
  );
}
