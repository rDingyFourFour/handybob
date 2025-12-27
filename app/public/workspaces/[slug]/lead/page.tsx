// Public lead capture page: resolves workspace by slug via admin client, renders lead form without assuming any auth.
import { notFound } from "next/navigation";

import { createAdminClient } from "@/utils/supabase/admin";
import { PublicLeadForm } from "./publicLeadForm";

type WorkspacePublicProfile = {
  id: string;
  name: string | null;
  slug: string;
  brand_name: string | null;
  brand_tagline: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  public_lead_form_enabled?: boolean | null;
};

export const dynamic = "force-dynamic";

export default async function PublicLeadPage({
  params,
}: {
  params?: Promise<{ slug?: string | null } | null>;
}) {
  const resolvedParams = (await params) ?? {};
  const slug = typeof resolvedParams.slug === "string" ? resolvedParams.slug.trim() : "";
  if (!slug) {
    return notFound();
  }
  const supabase = createAdminClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select(
      "id, slug, name, brand_name, brand_tagline, business_email, business_phone, business_address, public_lead_form_enabled"
    )
    .eq("slug", slug)
    .maybeSingle<WorkspacePublicProfile>();

  if (!workspace) {
    return notFound();
  }

  const brand = workspace.brand_name || workspace.name || "HandyBob contractor";
  const disabled = workspace.public_lead_form_enabled === false;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-12">
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-amber-300">Booking request</div>
              <h1 className="text-3xl font-semibold text-slate-50 mt-1">{brand}</h1>
              {workspace.brand_tagline && (
                <p className="hb-muted text-sm mt-1">{workspace.brand_tagline}</p>
              )}
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1 text-right text-xs text-slate-400">
              {workspace.business_phone && <div>Phone: {workspace.business_phone}</div>}
              {workspace.business_email && <div>Email: {workspace.business_email}</div>}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30 backdrop-blur">
            {disabled ? (
              <div className="space-y-3 text-center py-6">
                <h2 className="text-2xl font-semibold text-slate-100">This booking link is not active</h2>
                <p className="hb-muted">
                  The contractor has paused online requests. Please reach out by phone or email instead.
                </p>
              </div>
            ) : (
              <PublicLeadForm
                workspaceSlug={workspace.slug}
                workspaceName={brand}
                businessEmail={workspace.business_email}
                businessPhone={workspace.business_phone}
              />
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
              <h3 className="font-semibold text-slate-100">What to expect</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>• We’ll review your request and reach out to confirm details.</li>
                <li>• Urgent issues are prioritized automatically.</li>
                <li>• You’ll get a follow-up via the contact details you provide.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
              <h3 className="font-semibold text-slate-100">Business info</h3>
              <div className="mt-3 space-y-1 text-sm text-slate-300">
                <div>{brand}</div>
                {workspace.business_phone && <div className="text-slate-400">Phone: {workspace.business_phone}</div>}
                {workspace.business_email && <div className="text-slate-400">Email: {workspace.business_email}</div>}
                {workspace.business_address && <div className="text-slate-400">{workspace.business_address}</div>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-xs text-slate-500 shadow-inner shadow-black/30">
              <p>Powered by HandyBob — organized job capture with AI triage and spam checks.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
