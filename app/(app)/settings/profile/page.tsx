export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Invalid date";
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

export default async function ProfileSettingsPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[settings/profile] Failed to init Supabase client:", error);
    return fallbackCard(
      "Profile settings unavailable",
      "Could not connect to Supabase. Check environment keys."
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
    return null;
  }

  const fullName =
    (user.user_metadata as { full_name?: string; name?: string } | undefined)?.full_name ??
    (user.user_metadata as { full_name?: string; name?: string } | undefined)?.name ??
    null;

  const createdLabel = formatDate(user.created_at);

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Profile settings</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Profile info</h1>
          <p className="text-sm text-slate-400">Your HandyBob account information.</p>
        </div>
        <div className="flex gap-2">
          <HbButton as="a" href="/dashboard" variant="ghost" size="sm">
            Back to dashboard
          </HbButton>
          <HbButton as="a" href="/settings/workspace" size="sm">
            Workspace settings
          </HbButton>
        </div>
      </div>
      <HbCard className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Account</p>
          <h2 className="text-2xl font-semibold text-slate-100">
            {fullName ?? user.email}
          </h2>
        </div>
        <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-2">
          <p>
            <span className="font-semibold">Email:</span> {user.email ?? "—"}
          </p>
          <p>
            <span className="font-semibold">User ID:</span> {user.id}
          </p>
          <p>
            <span className="font-semibold">Joined:</span> {createdLabel}
          </p>
          {fullName && (
            <p>
              <span className="font-semibold">Name:</span> {fullName}
            </p>
          )}
        </div>
      </HbCard>
    </div>
  );
}
