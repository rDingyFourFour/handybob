// app/settings/workspace/page.tsx
import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace, requireOwner } from "@/utils/workspaces";
import { logAuditEvent } from "@/utils/audit/log";

async function saveWorkspaceProfile(formData: FormData) {
  "use server";

  const supabase = createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  requireOwner(workspaceContext);

  const name = (formData.get("name") as string | null)?.trim() || null;
  const brandName = (formData.get("brand_name") as string | null)?.trim() || null;
  const brandTagline = (formData.get("brand_tagline") as string | null)?.trim() || null;
  const businessEmail = (formData.get("business_email") as string | null)?.trim() || null;
  const businessPhone = (formData.get("business_phone") as string | null)?.trim() || null;
  const businessAddress = (formData.get("business_address") as string | null)?.trim() || null;

  await supabase
    .from("workspaces")
    .update({
      name: name || workspaceContext.workspace.name,
      brand_name: brandName || name || workspaceContext.workspace.name,
      brand_tagline: brandTagline,
      business_email: businessEmail,
      business_phone: businessPhone,
      business_address: businessAddress,
    })
    .eq("id", workspaceContext.workspace.id);

  await logAuditEvent({
    supabase,
    workspaceId: workspaceContext.workspace.id,
    actorUserId: workspaceContext.user.id,
    action: "settings_updated",
    entityType: "workspace_profile",
    entityId: workspaceContext.workspace.id,
    metadata: {
      name,
      brand_name: brandName,
      brand_tagline: brandTagline,
      business_email: businessEmail,
      business_phone: businessPhone,
      business_address: businessAddress,
    },
  });

  revalidatePath("/settings/workspace");
}

export default async function WorkspaceProfilePage() {
  const supabase = createServerClient();
  const context = await getCurrentWorkspace({ supabase });
  const { workspace, role } = context;

  const { data: workspaceRow } = await supabase
    .from("workspaces")
    .select("id, name, brand_name, brand_tagline, business_email, business_phone, business_address")
    .eq("id", workspace.id)
    .maybeSingle();

  const w = workspaceRow ?? {
    name: workspace.name,
    brand_name: workspace.name,
    brand_tagline: null,
    business_email: null,
    business_phone: null,
    business_address: null,
  };

  const readOnly = role !== "owner";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1>Workspace profile</h1>
        <p className="hb-muted">
          Business identity used across the app, outgoing emails, and public quote/invoice pages. Applies to all workspace members.
        </p>
        <div className="mt-1 text-[11px] uppercase text-slate-500">
          Workspace settings for {workspace.name || "Workspace"}
        </div>
        {readOnly && (
          <p className="text-sm text-amber-300 mt-2">You don’t have permission to edit workspace settings.</p>
        )}
      </div>

      <form action={readOnly ? undefined : saveWorkspaceProfile} className="hb-card space-y-4">
        <div>
          <label className="hb-label" htmlFor="name">Workspace name</label>
          <input
            id="name"
            name="name"
            className="hb-input"
            defaultValue={w.name ?? ""}
            disabled={readOnly}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="hb-label" htmlFor="brand_name">Business / brand name</label>
            <input
              id="brand_name"
              name="brand_name"
              className="hb-input"
              placeholder="Displayed to customers"
              defaultValue={w.brand_name ?? ""}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className="hb-label" htmlFor="brand_tagline">Tagline</label>
            <input
              id="brand_tagline"
              name="brand_tagline"
              className="hb-input"
              placeholder="e.g., Reliable handyman services"
              defaultValue={w.brand_tagline ?? ""}
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="hb-label" htmlFor="business_email">Business email</label>
            <input
              id="business_email"
              name="business_email"
              type="email"
              className="hb-input"
              defaultValue={w.business_email ?? ""}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className="hb-label" htmlFor="business_phone">Business phone</label>
            <input
              id="business_phone"
              name="business_phone"
              className="hb-input"
              placeholder="+1..."
              defaultValue={w.business_phone ?? ""}
              disabled={readOnly}
            />
          </div>
        </div>

        <div>
          <label className="hb-label" htmlFor="business_address">Address</label>
          <textarea
            id="business_address"
            name="business_address"
            className="hb-input"
            rows={3}
            placeholder="Street, city, region"
            defaultValue={w.business_address ?? ""}
            disabled={readOnly}
          />
        </div>

        {!readOnly && (
          <div className="flex justify-end">
            <button className="hb-button" type="submit">
              Save business profile
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
