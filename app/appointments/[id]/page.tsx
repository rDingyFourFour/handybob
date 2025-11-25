// app/appointments/[id]/page.tsx
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

type AppointmentWithRelations = {
  id: string;
  title: string | null;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  job_id: string | null;
  jobs:
    | {
        id: string;
        title: string | null;
      }
    | null;
};

type JobOption = {
  id: string;
  title: string | null;
};

async function updateAppointmentAction(formData: FormData) {
  "use server";

  const { supabase, workspace } = await getAppointmentContext();

  const apptId = String(formData.get("appointment_id"));
  const title = String(formData.get("title") || "").trim();
  const jobId = String(formData.get("job_id") || "").trim() || null;
  const startTime = String(formData.get("start_time") || "");
  const endTime = String(formData.get("end_time") || "");
  const status = String(formData.get("status") || "scheduled").trim();
  const notes = String(formData.get("notes") || "").trim();

  const { error } = await supabase
    .from("appointments")
    .update({
      title,
      job_id: jobId,
      start_time: startTime ? new Date(startTime).toISOString() : null,
      end_time: endTime ? new Date(endTime).toISOString() : null,
      status,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", apptId)
    .eq("workspace_id", workspace.id);

  if (error) {
    throw new Error(error.message);
  }

  redirect(`/appointments/${apptId}`);
}

async function deleteAppointmentAction(formData: FormData) {
  "use server";

  const { supabase, workspace } = await getAppointmentContext();

  const apptId = String(formData.get("appointment_id"));
  await supabase
    .from("appointments")
    .delete()
    .eq("id", apptId)
    .eq("workspace_id", workspace.id);
  redirect("/appointments");
}

async function getAppointmentContext() {
  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });
  return { supabase, workspace };
}

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, workspace } = await getAppointmentContext();

  const [{ data: appt }, { data: jobs }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        `
          id,
          title,
          status,
          start_time,
          end_time,
          notes,
          job_id,
          jobs ( id, title )
        `
      )
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("id, title")
      .eq("workspace_id", workspace.id)
      .order("title", { ascending: true }),
  ]);

  const appointment = appt as AppointmentWithRelations | null;

  if (!appointment) {
    redirect("/appointments");
  }

  const jobOptions = (jobs ?? []) as JobOption[];
  const startDefault = appointment.start_time ? appointment.start_time.slice(0, 16) : "";
  const endDefault = appointment.end_time ? appointment.end_time.slice(0, 16) : "";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="hb-card space-y-1">
        <h1>Appointment</h1>
        <p className="hb-muted text-sm">Update details or change status.</p>
      </div>

      <form action={updateAppointmentAction} className="hb-card space-y-4">
        <input type="hidden" name="appointment_id" value={appointment.id} />

        <div>
          <label className="hb-label" htmlFor="title">Title</label>
          <input id="title" name="title" className="hb-input" defaultValue={appointment.title ?? ""} required />
        </div>

        <div>
          <label className="hb-label" htmlFor="job_id">Job</label>
          <select id="job_id" name="job_id" className="hb-input" defaultValue={appointment.job_id ?? ""}>
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
            <input
              id="start_time"
              name="start_time"
              type="datetime-local"
              className="hb-input"
              defaultValue={startDefault}
              required
            />
          </div>
          <div>
            <label className="hb-label" htmlFor="end_time">End time</label>
            <input
              id="end_time"
              name="end_time"
              type="datetime-local"
              className="hb-input"
              defaultValue={endDefault}
            />
          </div>
        </div>

        <div>
          <label className="hb-label" htmlFor="status">Status</label>
          <select id="status" name="status" className="hb-input" defaultValue={appointment.status || "scheduled"}>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>

        <div>
          <label className="hb-label" htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" className="hb-input" rows={3} defaultValue={appointment.notes ?? ""} />
        </div>

        <div className="flex justify-end gap-2">
          <form action={deleteAppointmentAction}>
            <input type="hidden" name="appointment_id" value={appointment.id} />
            <button type="submit" className="hb-button-ghost">Delete</button>
          </form>
          <button type="submit" className="hb-button">Save changes</button>
        </div>
      </form>
    </div>
  );
}
