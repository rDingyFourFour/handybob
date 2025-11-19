import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

type JobOption = {
  id: string;
  title: string | null;
};

async function createAppointmentAction(formData: FormData) {
  "use server";

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") || "").trim();
  const jobId = String(formData.get("job_id") || "").trim() || null;
  const startTime = String(formData.get("start_time") || "");
  const endTime = String(formData.get("end_time") || "");
  const notes = String(formData.get("notes") || "").trim();

  if (!title || !startTime) {
    throw new Error("Title and start time are required");
  }

  const { error } = await supabase.from("appointments").insert({
    title,
    job_id: jobId,
    user_id: user.id,
    start_time: new Date(startTime).toISOString(),
    end_time: endTime ? new Date(endTime).toISOString() : null,
    notes: notes || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect("/appointments");
}

export default async function NewAppointmentPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title")
    .order("title", { ascending: true });

  const jobOptions = (jobs ?? []) as JobOption[];

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
          <select id="job_id" name="job_id" className="hb-input">
            <option value="">No job selected</option>
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title || "Untitled job"}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="hb-label" htmlFor="start_time">Start time</label>
            <input id="start_time" name="start_time" type="datetime-local" className="hb-input" required />
          </div>
          <div>
            <label className="hb-label" htmlFor="end_time">End time</label>
            <input id="end_time" name="end_time" type="datetime-local" className="hb-input" />
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
