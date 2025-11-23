// app/settings/workspace/page.tsx
import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace, requireOwner } from "@/utils/workspaces";
import { logAuditEvent } from "@/utils/audit/log";
import { publicBookingUrl } from "@/utils/urls/public";

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

async function toggleLeadForm(formData: FormData) {
  "use server";

  const supabase = createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  requireOwner(workspaceContext);

  const enabled = formData.get("public_lead_form_enabled") === "on";

  await supabase
    .from("workspaces")
    .update({ public_leads_enabled: enabled, public_lead_form_enabled: enabled })
    .eq("id", workspaceContext.workspace.id);

  await logAuditEvent({
    supabase,
    workspaceId: workspaceContext.workspace.id,
    actorUserId: workspaceContext.user.id,
    action: "lead_form_toggled",
    entityType: "workspace",
    entityId: workspaceContext.workspace.id,
    metadata: { enabled },
  });

  revalidatePath("/settings/workspace");
}

async function updateWorkspaceSlug(formData: FormData) {
  "use server";

  const supabase = createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  requireOwner(workspaceContext);

  const desired = (formData.get("slug") as string | null)?.trim().toLowerCase();
  if (!desired) {
    throw new Error("Slug is required");
  }

  const cleaned = desired.replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "") || "workspace";

  const { data: existing } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", cleaned)
    .maybeSingle();

  if (existing && existing.id !== workspaceContext.workspace.id) {
    throw new Error("Slug already in use");
  }

  await supabase
    .from("workspaces")
    .update({ slug: cleaned })
    .eq("id", workspaceContext.workspace.id);

  await logAuditEvent({
    supabase,
    workspaceId: workspaceContext.workspace.id,
    actorUserId: workspaceContext.user.id,
    action: "workspace_slug_updated",
    entityType: "workspace",
    entityId: workspaceContext.workspace.id,
    metadata: { slug: cleaned },
  });

  revalidatePath("/settings/workspace");
}

async function toggleAutoConfirm(formData: FormData) {
  "use server";

  const supabase = createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  requireOwner(workspaceContext);

  const enabled = formData.get("auto_confirmation_email_enabled") === "on";

  await supabase
    .from("workspaces")
    .update({ auto_confirmation_email_enabled: enabled })
    .eq("id", workspaceContext.workspace.id);

  await logAuditEvent({
    supabase,
    workspaceId: workspaceContext.workspace.id,
    actorUserId: workspaceContext.user.id,
    action: "lead_form_auto_confirm_toggled",
    entityType: "workspace",
    entityId: workspaceContext.workspace.id,
    metadata: { enabled },
  });

  revalidatePath("/settings/workspace");
}

export default async function WorkspaceProfilePage() {
  const supabase = createServerClient();
  const context = await getCurrentWorkspace({ supabase });
  const { workspace, role } = context;

  const { data: workspaceRow } = await supabase
    .from("workspaces")
    .select("id, name, slug, brand_name, brand_tagline, business_email, business_phone, business_address, public_lead_form_enabled, auto_confirmation_email_enabled")
    .eq("id", workspace.id)
    .maybeSingle();

  const w = workspaceRow ?? {
    name: workspace.name,
    brand_name: workspace.name,
    brand_tagline: null,
    business_email: null,
    business_phone: null,
    business_address: null,
    public_lead_form_enabled: true,
    auto_confirmation_email_enabled: false,
    slug: workspace.slug ?? "",
  };

  const readOnly = role !== "owner";
  const publicLeadUrl = w.slug ? publicBookingUrl(w.slug) : null;
  const embedCode = publicLeadUrl
    ? `<iframe src="${publicLeadUrl}" style="width:100%;min-height:700px;border:0;border-radius:12px;" loading="lazy"></iframe>`
    : null;
  const scriptEmbed = publicLeadUrl
    ? `<div id="handybob-booking"></div>\n<script>(function(){var d=document.getElementById("handybob-booking");if(!d)return;var f=document.createElement("iframe");f.src="${publicLeadUrl}";f.style.width="100%";f.style.minHeight="700px";f.style.border="0";f.style.borderRadius="12px";f.loading="lazy";d.appendChild(f);}());</script>`
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1>Workspace settings</h1>
        <p className="hb-muted">
          Business profile used across the app, outgoing emails, and public quote/invoice pages. Applies to all workspace members.
        </p>
        <div className="mt-1 text-[11px] uppercase text-slate-500">
          Business profile for {workspace.name || "Workspace"}
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

      <div className="hb-card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Public lead form</h2>
            <p className="hb-muted text-sm">
              Share a booking link or embed the form on your website. Submissions flow into customers + leads with AI triage and spam filters.
            </p>
          </div>
        </div>

        <form action={readOnly ? undefined : updateWorkspaceSlug} className="space-y-2">
          <label className="hb-label text-xs" htmlFor="slug">Workspace slug</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <input
              id="slug"
              name="slug"
              defaultValue={w.slug ?? ""}
              className="hb-input"
              disabled={readOnly}
              placeholder="handybob-contracting"
              pattern="[a-z0-9-]+"
            />
            {!readOnly && (
              <button className="hb-button-ghost text-xs" type="submit">
                Save slug
              </button>
            )}
          </div>
          <p className="hb-muted text-xs">Lowercase, URL-safe. Must be unique.</p>
        </form>

        <div className="space-y-2">
          <label className="hb-label text-xs">Shareable link</label>
          <input
            readOnly
            value={publicLeadUrl ?? "Add a slug to generate a link"}
            className="hb-input"
          />
        </div>

        {embedCode && (
          <div className="space-y-2">
            <label className="hb-label text-xs">Embed code (iframe)</label>
            <textarea
              readOnly
              className="hb-textarea text-xs"
              rows={3}
              value={embedCode}
            />
            <p className="hb-muted text-xs">Paste this into your website to embed your HandyBob booking form. The iframe is responsive and sized to avoid scrollbars.</p>
          </div>
        )}

        {scriptEmbed && (
          <div className="space-y-2">
            <label className="hb-label text-xs">Embed code (script injector)</label>
            <textarea
              readOnly
              className="hb-textarea text-xs"
              rows={4}
              value={scriptEmbed}
            />
            <p className="hb-muted text-xs">Alternative: paste this snippet; it injects a responsive iframe into a div with id handybob-booking.</p>
          </div>
        )}

        <form action={readOnly ? undefined : toggleLeadForm} className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="public_lead_form_enabled"
              defaultChecked={w.public_lead_form_enabled ?? true}
              disabled={readOnly}
            />
            <span>Accept new requests from the public form</span>
          </label>
          {!readOnly && (
            <button className="hb-button-ghost text-xs" type="submit">
              Save form setting
            </button>
          )}
        </form>

        <form action={readOnly ? undefined : toggleAutoConfirm} className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="auto_confirmation_email_enabled"
              defaultChecked={w.auto_confirmation_email_enabled ?? false}
              disabled={readOnly}
            />
            <span>Send automatic confirmation email to public leads</span>
          </label>
          {!readOnly && (
            <button className="hb-button-ghost text-xs" type="submit">
              Save confirmation setting
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
