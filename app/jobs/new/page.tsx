import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

// Job creation runs inside a server action so no writes happen at import time; the action stays workspace-scoped.
export async function createJobAction(formData: FormData) {
  "use server";

  const title = (formData.get("title") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim();
  const scheduledAt = (formData.get("scheduled_at") as string | null)?.trim();
  const customerName = (formData.get("customer_name") as string | null)?.trim() || null;

  if (!title) {
    throw new Error("Title is required");
  }

  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      workspace_id: workspace.id,
      title,
      description,
      scheduled_at: scheduledAt || null,
      customer_name: customerName,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Failed to create job");
  }

  redirect(`/jobs/${data.id}`);
}

export default async function NewJobPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">New job</h1>
        <p className="text-sm text-slate-400">
          Submitting creates a workspace-scoped job via the domain-safe action above.
        </p>
      </header>

      <form action={createJobAction} className="hb-card grid gap-4 text-sm">
        <label className="flex flex-col gap-1">
          Title
          <input name="title" className="hb-input" placeholder="Fix broken faucet" required />
        </label>

        <label className="flex flex-col gap-1">
          Description
          <textarea
            name="description"
            className="hb-input min-h-[120px]"
            placeholder="Details for the technician"
          />
        </label>

        <label className="flex flex-col gap-1">
          Customer name
          <input name="customer_name" className="hb-input" placeholder="Alex Carpenter" />
        </label>

        <label className="flex flex-col gap-1">
          Scheduled at
          <input name="scheduled_at" type="datetime-local" className="hb-input" />
        </label>

        <button className="hb-button" type="submit">
          Create job
        </button>
      </form>
    </div>
  );
}
