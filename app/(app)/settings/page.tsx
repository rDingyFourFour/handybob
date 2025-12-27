export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import SignOutButton from "@/app/(app)/settings/SignOutButton";
import PublicBookingLinkCard from "@/app/(app)/settings/PublicBookingLinkCard";

type WorkspaceDetail = {
  id: string;
  name: string | null;
  owner_id: string | null;
  slug: string | null;
  brand_name: string | null;
  brand_tagline: string | null;
  business_phone: string | null;
  public_lead_form_enabled?: boolean | null;
};

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
  return fallbackCard(
    "Unable to load settings",
    "Something went wrong while loading this page. Please try again or go back to the dashboard."
  );
}

export default async function SettingsHomePage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[settings] Failed to initialize Supabase client:", error);
    return renderSettingsErrorCard();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let workspaceContext;
  try {
    workspaceContext = await getCurrentWorkspace({ supabase });
  } catch (error) {
    console.error("[settings] Failed to resolve workspace context:", error);
    return renderSettingsErrorCard();
  }

  const { workspace } = workspaceContext;

  let workspaceRow: WorkspaceDetail | null = null;
  let workspaceLoadError = false;
  try {
    const { data, error } = await supabase
      .from<WorkspaceDetail>("workspaces")
      .select("id, name, owner_id, slug, brand_name, brand_tagline, business_phone, public_lead_form_enabled")
      .eq("id", workspace.id)
      .maybeSingle();
    if (error) {
      console.error("[settings] Failed to load workspace details:", error);
      workspaceLoadError = true;
    } else {
      workspaceRow = data ?? null;
    }
  } catch (error) {
    console.error("[settings] Failed to load workspace details:", error);
    workspaceLoadError = true;
  }

  const metadata = (user.user_metadata as
    | {
        full_name?: string | null;
        name?: string | null;
        contact_email?: string | null;
        contact_phone?: string | null;
      }
    | undefined) ?? {};

  const ownerDisplayName = metadata.full_name ?? metadata.name ?? null;
  const ownerEmail = metadata.contact_email ?? user.email;
  const ownerPhone = metadata.contact_phone ?? user.phone ?? null;

  const workspaceDisplayName =
    workspaceRow?.brand_name ?? workspace.name ?? "Workspace";
  const workspaceServiceArea =
    workspaceRow?.brand_tagline ?? "Add a short description of your service area.";
  const workspacePhoneLabel =
    workspaceRow?.business_phone ?? "Add a phone label in Workspace settings.";
  const workspaceInitial = workspaceDisplayName?.trim().charAt(0).toUpperCase() ?? "W";
  const workspaceSlug = workspaceRow?.slug ?? workspace.slug ?? null;
  const publicBookingEnabled = workspaceRow?.public_lead_form_enabled !== false;
  const canManageBookings = workspaceContext.role === "owner";

  return (
    <div className="hb-shell pt-20 pb-8 space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="hb-heading-2 text-2xl font-semibold text-slate-100">Settings</h1>
          <p className="text-sm text-slate-400">
            A control center for your workspace basics, profile, and automation defaults.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HbButton as="a" href="/dashboard" size="sm">
            Back to dashboard
          </HbButton>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <HbCard className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="hb-card-heading text-xl font-semibold text-slate-100">Workspace basics</h2>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Brand, logo, and territory
              </p>
            </div>
            <HbButton as="a" href="/settings/workspace" variant="ghost" size="sm">
              Manage
            </HbButton>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-slate-200">
              {workspaceInitial}
            </div>
            <div className="space-y-1 text-sm text-slate-300">
              <p>
                <span className="font-semibold text-slate-100">Display name:</span>{" "}
                {workspaceDisplayName}
              </p>
              <p>
                <span className="font-semibold text-slate-100">Service area:</span>{" "}
                {workspaceServiceArea}
              </p>
              <p>
                <span className="font-semibold text-slate-100">Logo / emoji:</span>{" "}
                {workspaceInitial
                  ? `${workspaceInitial} (placeholder)`
                  : "Add a logo or emoji soon"}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            These values flow into quotes, follow-up messages, and invoices.
          </p>
        </HbCard>

        <HbCard className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="hb-card-heading text-xl font-semibold text-slate-100">Owner profile</h2>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Your caller identity
              </p>
            </div>
            <HbButton as="a" href="/settings/profile" variant="ghost" size="sm">
              Manage
            </HbButton>
          </div>
          <div className="space-y-1 text-sm text-slate-300">
            <p>
              <span className="font-semibold text-slate-100">Name:</span>{" "}
              {ownerDisplayName ?? "Add a display name"}
            </p>
            <p>
              <span className="font-semibold text-slate-100">Email:</span>{" "}
              {ownerEmail ?? "—"}
            </p>
            <p>
              <span className="font-semibold text-slate-100">Phone:</span>{" "}
              {ownerPhone ?? "Add a phone number"}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            We’ll use this info in call summaries, follow-up drafts, and your message signatures.
          </p>
        </HbCard>

        <HbCard className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="hb-card-heading text-xl font-semibold text-slate-100">
                Communication defaults
              </h2>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Channels & tone
              </p>
            </div>
            <HbButton as="a" href="/settings/profile" variant="ghost" size="sm">
              Manage
            </HbButton>
          </div>
          <div className="space-y-1 text-sm text-slate-300">
            <p>
              <span className="font-semibold text-slate-100">Follow-up channels:</span> SMS + Email
            </p>
            <p>
              <span className="font-semibold text-slate-100">Phone label:</span>{" "}
              {workspacePhoneLabel}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Follow-up drafts default to the channels above and mention your workspace branding.
          </p>
        </HbCard>

        <PublicBookingLinkCard
          slug={workspaceSlug}
          workspaceId={workspace.id}
          enabled={publicBookingEnabled}
          canManage={canManageBookings}
        />

        {user && (
          <HbCard className="space-y-4">
            <div>
              <h2 className="hb-card-heading text-xl font-semibold text-slate-100">Account</h2>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Access</p>
            </div>
            <p className="text-sm text-slate-300">
              Signing out will return you to the login screen.
            </p>
            <SignOutButton userId={user.id} workspaceId={workspace.id} />
          </HbCard>
        )}
      </div>

      {workspaceLoadError && (
        <p className="text-xs text-slate-400">
          We couldn’t load some workspace metadata right now.
        </p>
      )}
    </div>
  );
}
