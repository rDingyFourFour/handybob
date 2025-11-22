import { createAdminClient } from "@/utils/supabase/admin";
import { BookingForm } from "./BookingForm";

type WorkspacePublicProfile = {
  id: string;
  name: string | null;
  slug: string;
  brand_name: string | null;
  brand_tagline: string | null;
  public_lead_form_enabled?: boolean | null;
};

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({ params }: { params: { slug: string } }) {
  const supabase = createAdminClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, slug, name, brand_name, brand_tagline, public_lead_form_enabled")
    .eq("slug", params.slug)
    .maybeSingle<WorkspacePublicProfile>();

  if (!workspace) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="hb-card max-w-xl text-center space-y-2">
          <h1 className="text-2xl font-semibold">This booking link is not active</h1>
          <p className="hb-muted">Please contact the business directly to request service.</p>
        </div>
      </div>
    );
  }

  const disabled = workspace.public_lead_form_enabled === false;

  if (disabled) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="hb-card max-w-xl text-center space-y-2">
          <h1 className="text-2xl font-semibold">This booking link is not active</h1>
          <p className="hb-muted">Please contact the business directly to request service.</p>
        </div>
      </div>
    );
  }

  const brand = workspace.brand_name || workspace.name || "Contractor";
  const tagline = workspace.brand_tagline || "Trusted help for your home.";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-amber-300">Booking request</div>
            <h1 className="text-2xl font-semibold text-slate-50">{brand}</h1>
            {tagline && <p className="hb-muted text-sm">{tagline}</p>}
          </div>
          <div className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-300">
            No account needed
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30 backdrop-blur">
            <BookingForm workspaceSlug={workspace.slug} workspaceName={brand} />
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
              <h3 className="font-semibold text-slate-100">What to expect</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>• We review your request and reach out to confirm details.</li>
                <li>• Emergencies are prioritized automatically.</li>
                <li>• A quick description helps us prep the right tools.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
              <h3 className="font-semibold text-slate-100">Quick tips</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>• Include photos when we follow up for faster scheduling.</li>
                <li>• If you picked a date, we’ll try to match it or propose the closest slot.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
