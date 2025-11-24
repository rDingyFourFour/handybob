import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";

type JobOption = {
  id: string;
  title: string | null;
  customerName: string | null;
};

type JobRow = {
  id: string;
  title: string | null;
  customers:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

async function createAppointmentAction(formData: FormData) {
  "use server";

  const supabase = await createServerClient();
  const { user, workspace } = await getCurrentWorkspace({ supabase });

  const title = String(formData.get("title") || "").trim();
  const jobId = String(formData.get("job_id") || "").trim() || null;
  const date = String(formData.get("date") || "").trim();
  const startTime = String(formData.get("start_time") || "").trim();
  const endTime = String(formData.get("end_time") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!title || !date || !startTime) {
    throw new Error("Title, date, and start time are required");
  }

  const startDateTime = new Date(`${date}T${startTime}`);
  const endDateTime = endTime ? new Date(`${date}T${endTime}`) : null;

  // Server action: require title/date/start, then insert appointment scoped to workspace_id so both owner/staff can manage schedules while updates remain audit-friendly via user_id.
  const { error } = await supabase.from("appointments").insert({
    title,
    job_id: jobId,
    user_id: user.id,
    workspace_id: workspace.id,
    start_time: startDateTime.toISOString(),
    end_time: endDateTime ? endDateTime.toISOString() : null,
    location: location || null,
    notes: notes || null,
    status: "scheduled",
    // In a future Google Calendar integration, this is where we'd create the
    // Google event and stash its id in external_event_id so webhooks/polling
    // can reconcile updates.
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect("/appointments");
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ job_id?: string }>;
}) {
  const resolvedParams = await searchParams;
  const preselectedJobId = resolvedParams?.job_id || "";

  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      `
        id,
        title,
        customers ( name )
      `
    )
    .eq("workspace_id", workspace.id)
    .order("title", { ascending: true });

  const jobOptions: JobOption[] = ((jobs ?? []) as JobRow[]).map((job) => ({
    id: job.id,
    title: job.title,
    customerName: Array.isArray(job.customers)
      ? job.customers[0]?.name ?? null
      : job.customers?.name ?? null,
  }));

  return (
    <div className="max-w-2xl space-y-6">
      <div className="hb-card space-y-1">
        <h1>New appointment</h1>
        <p className="hb-muted">Schedule a visit and keep it on your calendar.</p>
      </div>

      <form action={createAppointmentAction} className="hb-card space-y-4">
        <div>
          <label className="hb-label" htmlFor="title">Title</label>
          <input id="title" name="title" className="hb-input" required />
        </div>

        <div>
          <label className="hb-label" htmlFor="job_id">Job (optional)</label>
          <select id="job_id" name="job_id" className="hb-input" defaultValue={preselectedJobId}>
            <option value="">No job selected</option>
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title || "Untitled job"}
                {job.customerName ? ` · ${job.customerName}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="hb-label" htmlFor="date">Date</label>
            <input id="date" name="date" type="date" className="hb-input" required />
          </div>
          <div>
            <label className="hb-label" htmlFor="start_time">Start time</label>
            <input id="start_time" name="start_time" type="time" className="hb-input" required />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="hb-label" htmlFor="end_time">End time</label>
            <input id="end_time" name="end_time" type="time" className="hb-input" />
          </div>
          <div>
            <label className="hb-label" htmlFor="location">Location</label>
          <input id="location" name="location" className="hb-input" placeholder="Customer address or notes" />
          </div>
        </div>

        <div>
          <label className="hb-label" htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="hb-input" rows={3} />
        </div>

        <div className="flex justify-end gap-2">
          <Link href="/appointments" className="hb-button-ghost">Cancel</Link>
          <button type="submit" className="hb-button">Create appointment</button>
        </div>
      </form>
    </div>
  );
}
