export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";

type CallRow = {
  id: string;
  workspace_id: string;
  created_at: string | null;
  from_number: string | null;
  status: string | null;
  priority: string | null;
  needs_followup: boolean | null;
  job_id: string | null;
  customer_id: string | null;
};

import HbButton from "@/components/ui/hb-button";

export default async function CallsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[calls] Failed to resolve workspace:", error);
    return (
      <div className="hb-shell pt-20 pb-8 space-y-4">
        <HbCard className="space-y-2">
          <h1 className="hb-heading-1 text-2xl font-semibold">Calls</h1>
          <p className="hb-muted text-sm">Unable to load workspace context.</p>
        </HbCard>
      </div>
    );
  }

  const callsRes = await supabase
    .from("calls")
    .select(
      "id, workspace_id, created_at, from_number, status, priority, needs_followup, job_id, customer_id"
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const calls = (callsRes.data ?? []) as CallRow[];

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleString();
  };

  return (
    <div className="hb-shell pt-20 pb-8 space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calls</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Calls</h1>
          <p className="hb-muted text-sm">Simple log of recent calls.</p>
        </div>
        <HbButton as={Link} href="/calls/new" size="sm" variant="secondary">
          New call
        </HbButton>
      </header>

      <HbCard className="space-y-3">
        {calls.length === 0 ? (
          <div className="space-y-2">
            <h2 className="hb-card-heading text-lg font-semibold">No calls yet</h2>
            <p className="hb-muted text-sm">You can create one using the button above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {calls.map((call) => (
              <div
                key={call.id}
                className="flex flex-col gap-1 rounded-lg border border-slate-800 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{formatDate(call.created_at)}</p>
                  <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.3em]">
                    <Link
                      href={`/calls/${call.id}`}
                      className="text-slate-500 hover:text-slate-100 transition"
                    >
                      View
                    </Link>
                    {call.job_id && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Job:</span>
                        <Link
                          href={`/jobs/${call.job_id}`}
                          className="text-slate-500 hover:text-slate-100 transition"
                        >
                          View job
                        </Link>
                      </span>
                    )}
                    {call.customer_id && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                          Customer:
                        </span>
                        <Link
                          href={`/customers/${call.customer_id}`}
                          className="text-slate-500 hover:text-slate-100 transition"
                        >
                          View customer
                        </Link>
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-400">
                  From: {call.from_number ?? "Unknown"} · Status: {call.status ?? "unknown"}
                </p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Priority: {call.priority ?? "normal"} · Needs follow-up:{" "}
                  {call.needs_followup ? "Yes" : "No"}
                </p>
              </div>
            ))}
          </div>
        )}
      </HbCard>
    </div>
  );
}
