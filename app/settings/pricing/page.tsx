// app/settings/pricing/page.tsx
import Link from "next/link";
import { revalidatePath } from "next/cache";

import { ensurePricingSettings } from "@/utils/ensurePricingSettings";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace, requireOwner } from "@/lib/domain/workspaces";
import { logAuditEvent } from "@/utils/audit/log";

export const dynamic = "force-dynamic";


async function updatePricingSettings(formData: FormData) {
  "use server";

  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  requireOwner(workspaceContext);
  const workspace = workspaceContext.workspace;

  const hourlyRate = Number(formData.get("hourly_rate"));
  const minimumFee = Number(formData.get("minimum_job_fee"));
  const travelFee = Number(formData.get("travel_fee"));

  const payload = {
    hourly_rate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
    minimum_job_fee: Number.isFinite(minimumFee) ? minimumFee : 0,
    travel_fee: Number.isFinite(travelFee) ? travelFee : 0,
  };

  const { error } = await supabase
    .from("pricing_settings")
    .update(payload)
    .eq("workspace_id", workspace.id);

  if (error) {
    throw new Error(error.message);
  }

  // Audit: pricing settings updated
  await logAuditEvent({
    supabase,
    workspaceId: workspace.id,
    actorUserId: workspaceContext.user.id,
    action: "settings_updated",
    entityType: "pricing_settings",
    entityId: workspace.id,
    metadata: payload,
  });

  revalidatePath("/settings/pricing");
}

export default async function PricingSettingsPage() {
  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  const { workspace, role } = workspaceContext;
  const settings = await ensurePricingSettings({ supabase, workspaceId: workspace.id });

  if (role !== "owner") {
    return (
      <div className="hb-card space-y-2">
        <h1>Pricing settings</h1>
        <p className="hb-muted">You don’t have permission to manage workspace settings.</p>
        <p className="text-[11px] uppercase text-slate-500">
          Workspace settings for {workspace.name || "Workspace"}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1>Pricing settings</h1>
        <p className="hb-muted">
          Manage your default hourly rate and fees for new jobs.
        </p>
        <p className="text-[11px] uppercase text-slate-500">
          Workspace settings for {workspace.name || "Workspace"}
        </p>
      </div>

      <form action={updatePricingSettings} className="hb-card space-y-4">
        <div>
          <label className="hb-label" htmlFor="hourly_rate">
            Hourly rate
          </label>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">$</span>
            <input
              id="hourly_rate"
              name="hourly_rate"
              type="number"
              step="1"
              min="0"
              defaultValue={settings.hourly_rate}
              className="hb-input"
              required
            />
            <span className="text-slate-400">/hr</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="hb-label" htmlFor="minimum_job_fee">
              Minimum job fee
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">$</span>
              <input
                id="minimum_job_fee"
                name="minimum_job_fee"
                type="number"
                step="1"
                min="0"
                defaultValue={settings.minimum_job_fee ?? 0}
                className="hb-input"
              />
            </div>
          </div>
          <div>
            <label className="hb-label" htmlFor="travel_fee">
              Travel fee
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">$</span>
              <input
                id="travel_fee"
                name="travel_fee"
                type="number"
                step="1"
                min="0"
                defaultValue={settings.travel_fee ?? 0}
                className="hb-input"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Link href="/dashboard" className="hb-button-ghost">
            Cancel
          </Link>
          <button type="submit" className="hb-button">
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
