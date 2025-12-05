export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";

import HbCard from "@/components/ui/hb-card";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace, requireOwner } from "@/lib/domain/workspaces";
import { logAuditEvent } from "@/utils/audit/log";

async function saveWorkspaceProfile(formData: FormData) {
  "use server";

  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  requireOwner(workspaceContext);

  const displayName = (formData.get("display_name") as string | null)?.trim() || null;
  const phoneLabel = (formData.get("phone_label") as string | null)?.trim() || null;
  const serviceArea = (formData.get("service_area") as string | null)?.trim() || null;

  const { error } = await supabase
    .from("workspaces")
    .update({
      brand_name: displayName || workspaceContext.workspace.name,
      business_phone: phoneLabel,
      brand_tagline: serviceArea,
    })
    .eq("id", workspaceContext.workspace.id);

  if (error) {
    console.error("[workspace-settings] Failed to save profile", error);
    throw error;
  }

  await logAuditEvent({
    supabase,
    workspaceId: workspaceContext.workspace.id,
    actorUserId: workspaceContext.user.id,
    action: "settings_updated",
    entityType: "workspace_profile",
    entityId: workspaceContext.workspace.id,
    metadata: {
      brand_name: displayName,
      business_phone: phoneLabel,
      brand_tagline: serviceArea,
    },
  });

  revalidatePath("/settings/workspace");
}

export default async function WorkspaceSettingsPage() {
  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  const { workspace, role } = workspaceContext;

  const { data: workspaceRow, error: workspaceError } = await supabase
    .from("workspaces")
    .select("brand_name, brand_tagline, business_phone")
    .eq("id", workspace.id)
    .maybeSingle();
  if (workspaceError) {
    console.error("[workspace-settings] Failed to fetch workspace profile", workspaceError);
  }

  const profile = {
    brand_name: workspaceRow?.brand_name ?? workspace.name,
    brand_tagline: workspaceRow?.brand_tagline ?? null,
    business_phone: workspaceRow?.business_phone ?? null,
  };

  const readOnly = role !== "owner";

  return (
    <div className="hb-shell pt-20 pb-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="hb-heading-2 text-2xl font-semibold text-slate-100">Workspace settings</h1>
          <p className="text-sm text-slate-400">
            Capture the workspace identity that future automations and outgoing messages will reference.
          </p>
          {readOnly && (
            <p className="text-sm text-amber-300">
              You don’t have permission to edit workspace settings. Contact the workspace owner for changes.
            </p>
          )}
        </div>

        <HbCard className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              These fields flow into quotes, follow-up messages, and invoices so customers see consistent details.
            </p>
          </div>
          <form action={readOnly ? undefined : saveWorkspaceProfile} className="space-y-4">
            <div>
              <label className="hb-label" htmlFor="display_name">
                Workspace display name
              </label>
              <input
                id="display_name"
                name="display_name"
                className="hb-input"
                defaultValue={profile.brand_name ?? ""}
                placeholder="Your business name as customers see it"
                disabled={readOnly}
              />
              <p className="text-xs text-slate-500">
                This name shows up in quotes, invoices, and follow-up drafts.
              </p>
            </div>

            <div>
              <label className="hb-label" htmlFor="phone_label">
                Default outbound phone label
              </label>
              <input
                id="phone_label"
                name="phone_label"
                className="hb-input"
                placeholder="Shown on messages and invoices"
                defaultValue={profile.business_phone ?? ""}
                disabled={readOnly}
              />
              <p className="text-xs text-slate-500">
                Used alongside the outbound channels so customers know who is reaching out.
              </p>
            </div>

            <div>
              <label className="hb-label" htmlFor="service_area">
                Service area description
              </label>
              <textarea
                id="service_area"
                name="service_area"
                className="hb-input"
                placeholder="e.g., Serving North Austin and nearby suburbs"
                rows={3}
                defaultValue={profile.brand_tagline ?? ""}
                disabled={readOnly}
              />
              <p className="text-xs text-slate-500">
                A short sentence that highlights where you operate and helps personalize automation copies.
              </p>
            </div>

            <div className="flex justify-end">
              <button className="hb-button" type="submit" disabled={readOnly}>
                Save workspace basics
              </button>
            </div>
          </form>
        </HbCard>
      </div>
    </div>
  );
}
