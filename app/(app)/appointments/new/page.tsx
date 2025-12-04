export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { createAppointment } from "@/app/actions/appointments";

type JobSummary = {
  id: string;
  title: string | null;
  status: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null; phone?: string | null }
    | Array<{ id: string | null; name: string | null; phone?: string | null }>
    | null;
};

type CustomerSummary = {
  id: string;
  name: string | null;
  phone?: string | null;
};

function resolveCustomer(job?: JobSummary): CustomerSummary | null {
  if (!job) {
    return null;
  }
  if (!job.customers) {
    return null;
  }
  if (Array.isArray(job.customers)) {
    return job.customers[0] ?? null;
  }
  return job.customers;
}

function shortId(value: string | null | undefined) {
  if (!value) return "—";
  return value.slice(0, 8);
}

export default async function AppointmentsNewPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[appointments/new] Failed to initialize Supabase client:", error);
    redirect("/appointments");
  }

  if (!supabase) {
    redirect("/appointments");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[appointments/new] Failed to resolve workspace:", error);
    redirect("/appointments");
  }

  if (!workspace) {
    redirect("/appointments");
  }

  const rawJobId = searchParams?.jobId;
  const requestedJobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId ?? null;
  const jobId = requestedJobId?.trim() ? requestedJobId.trim() : null;
  let job: JobSummary | null = null;
  let jobLookupError = false;

  if (jobId) {
    try {
      const { data, error } = await supabase
        .from<JobSummary>("jobs")
        .select("id, title, status, customer_id, customers(id, name, phone)")
        .eq("workspace_id", workspace.id)
        .eq("id", jobId)
        .maybeSingle();
      if (error) {
        console.error("[appointments/new] Failed to load job", error);
        jobLookupError = true;
      } else {
        job = data ?? null;
      }
    } catch (error) {
      console.error("[appointments/new] Job lookup failed", error);
      jobLookupError = true;
    }
  }

  const customer = resolveCustomer(job);
  const customerId = customer?.id ?? job?.customer_id ?? null;
  const customerName = customer?.name ?? null;

  const headerSubtitle = job
    ? "Scheduling for this job gives your crew and customers clarity about when to show up."
    : "Create a visit to document when your team will be on site.";

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Appointments</p>
        <h1 className="hb-heading-1 text-3xl font-semibold">Schedule a visit</h1>
        <p className="hb-muted text-sm">{headerSubtitle}</p>
        {job ? (
          <div className="grid gap-2 text-sm text-slate-400 md:grid-cols-2">
            <p>
              Job:{" "}
              <Link href={`/jobs/${job.id}`} className="font-semibold text-slate-100 hover:text-slate-50">
                {job.title ?? `Job ${shortId(job.id)}`}
              </Link>
            </p>
            <p>Status: {job.status ?? "—"}</p>
            {customerName && customerId && (
              <p>
                Customer:{" "}
                <Link href={`/customers/${customerId}`} className="font-semibold text-slate-100 hover:text-slate-50">
                  {customerName}
                </Link>
              </p>
            )}
            {!customerName && customerId && (
              <p>Customer: {`Customer ${shortId(customerId)}`}</p>
            )}
          </div>
        ) : jobLookupError ? (
          <p className="text-sm text-rose-300">Unable to preload the requested job at the moment.</p>
        ) : jobId ? (
          <p className="text-sm text-slate-400">Job {shortId(jobId)} (no job found). Fill in the visit details below.</p>
        ) : null}
      </header>

      <HbCard className="space-y-5">
        <form action={createAppointment} className="space-y-5">
          {jobId && <input type="hidden" name="jobId" value={jobId} />}

          <div className="space-y-2">
            <label htmlFor="title" className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
              Appointment title
              <span className="text-slate-400">Optional</span>
            </label>
            <input
              id="title"
              name="title"
              defaultValue={job?.title ?? ""}
              placeholder="Site visit, walkthrough, inspection, etc."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="date" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Date
              </label>
              <input
                id="date"
                name="date"
                type="date"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="startTime" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Start time
              </label>
              <input
                id="startTime"
                name="startTime"
                type="time"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="durationMinutes" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Duration (minutes)
              </label>
              <input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                defaultValue={60}
                min={15}
                step={15}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="endTime" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                End time (optional)
              </label>
              <input
                id="endTime"
                name="endTime"
                type="time"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                placeholder="Use to override duration"
              />
              <p className="text-[11px] text-slate-500">Leaving this blank uses the duration above.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="location" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Location (address or customer reference)
            </label>
            <input
              id="location"
              name="location"
              type="text"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              placeholder="123 Main St, backyard, or customer phone"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="status" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue="scheduled"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              placeholder="Share what needs attention or what’s been discussed with the customer."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <HbButton type="submit" size="sm">
              Schedule visit
            </HbButton>
            <HbButton as={Link} href="/appointments" size="sm" variant="ghost">
              Back to appointments
            </HbButton>
            {job && (
              <HbButton as={Link} href={`/jobs/${job.id}`} size="sm" variant="ghost">
                Back to job
              </HbButton>
            )}
          </div>
        </form>
      </HbCard>
    </div>
  );
}
