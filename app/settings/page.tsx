import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { Card } from "@/components/ui/Card";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";

const settingsSections = [
  {
    title: "Workspace profile",
    description:
      "Business name, contact info, and public booking link that appear across the app.",
    href: "/settings/workspace",
  },
  {
    title: "Notifications & automation",
    description: "Alert rules for urgent leads, SMS/email digests, and automation history.",
    href: "/settings/automation",
  },
  {
    title: "Pricing settings",
    description: "Hourly, travel, and minimum fees that flow into quotes and invoices.",
    href: "/settings/pricing",
  },
  {
    title: "Activity log",
    description: "Audit trail covering settings changes and workspace-wide events.",
    href: "/settings/activity",
  },
];

export async function signOutAction(formData: FormData) {
  "use server";
  const supabase = createServerClient();
  await supabase.auth.signOut();
  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/");
}

export default async function SettingsHomePage() {
  const supabase = createServerClient();
  const { workspace, role, user } = await getCurrentWorkspace({ supabase });
  const workspaceName = workspace.name || "Workspace";

  return (
    <div className="max-w-4xl space-y-6">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1>Settings</h1>
            <p className="hb-muted text-sm">
              Manage your workspace profile, notification preferences, and billing controls all in one place.
            </p>
            <div className="text-[11px] uppercase text-slate-500">
              Workspace settings for {workspaceName}
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="text-[11px] uppercase text-slate-500">Role</p>
            <p className="font-semibold">{role === "owner" ? "Workspace owner" : "Staff"}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Jump to a section</h2>
          <p className="hb-muted text-sm">
            Choose where you want to update workspace details, automation alerts, pricing, and audit history.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {settingsSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-xl border border-slate-800/80 px-4 py-3 text-sm transition hover:border-white/60 hover:bg-slate-900/50"
            >
              <p className="text-base font-semibold text-slate-100">{section.title}</p>
              <p className="text-xs text-slate-400">{section.description}</p>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Account & workspace</h2>
          <p className="hb-muted text-sm">
            Sign out when you’re done working and share this workspace with teammates only through the admin pages.
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-slate-800/70 bg-slate-950/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase text-slate-500">Signed in as</p>
              <p className="font-semibold tracking-tight">{user.email}</p>
            </div>
            <form action={signOutAction}>
              <button type="submit" className="hb-button-ghost text-sm">
                Sign out
              </button>
            </form>
          </div>
          <p className="hb-muted text-xs">
            Signing out removes your session from this browser. You’ll be returned to the landing page.
          </p>
        </div>
      </Card>
    </div>
  );
}
