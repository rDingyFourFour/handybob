export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";

type JobRecord = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[customer-detail] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[customer-detail] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[customer-detail] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!workspace) {
    redirect("/");
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, name, email, phone, created_at")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();

  if (customerError || !customer) {
    console.error("[customer-detail] Customer lookup failed:", customerError);
    return (
      <div className="hb-shell pt-20 pb-8">
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Customer not found</h1>
          <p className="hb-muted text-sm">
            We couldn’t load that customer. Please try again or return to the customer list.
          </p>
          <Link href="/customers" className="hb-button px-4 py-2 text-sm">
            Back to customers
          </Link>
        </HbCard>
      </div>
    );
  }

  let jobs: JobRecord[] = [];
  try {
    const { data: jobsData, error: jobsError } = await supabase
      .from("jobs")
      .select("id, title, status, created_at")
      .eq("workspace_id", workspace.id)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false, nulls: "last" })
      .limit(20);
    if (jobsError) {
      console.error("[customer-detail] Failed to load jobs:", jobsError);
    } else {
      jobs = (jobsData ?? []) as JobRecord[];
    }
  } catch (error) {
    console.error("[customer-detail] Failed to load jobs:", error);
  }

  const displayName = customer.name ?? "Unnamed customer";
  const createdLabel = formatDate(customer.created_at);

  const contactDetails = [customer.email, customer.phone].filter(Boolean);

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">{displayName}</h1>
          {contactDetails.length > 0 && (
            <p className="text-sm text-slate-400">
              {contactDetails.join(" · ")}
            </p>
          )}
          {createdLabel && <p className="hb-muted text-sm">Added {createdLabel}</p>}
        </div>
        <Link
          href="/customers"
          className="text-xs uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-100"
        >
          ← Back to customers
        </Link>
      </header>

      <HbCard className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Profile</p>
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-semibold">Name:</span> {customer.name ?? "—"}
          </p>
          <p>
            <span className="font-semibold">Email:</span> {customer.email ?? "—"}
          </p>
          <p>
            <span className="font-semibold">Phone:</span> {customer.phone ?? "—"}
          </p>
        </div>
        {createdLabel && <p className="hb-muted text-xs">Added on {createdLabel}</p>}
      </HbCard>

      <HbCard className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="hb-card-heading text-lg font-semibold">Jobs for this customer</h2>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {jobs.length} job{jobs.length === 1 ? "" : "s"}
          </p>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm hb-muted">
            No jobs linked to this customer yet. Create a job and associate this customer to see it here.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const jobDate = formatDate(job.created_at);
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group block rounded-2xl px-4 py-3 transition hover:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-100">
                        {job.title ?? "Untitled job"}
                      </p>
                      {job.status && (
                        <p className="text-sm text-slate-400">{job.status}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      {jobDate && (
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                          Created {jobDate}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </HbCard>
    </div>
  );
}
