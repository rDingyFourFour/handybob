// app/jobs/new/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { logAuditEvent } from "@/utils/audit/log";

export const dynamic = "force-dynamic";


async function createJob(formData: FormData) {
  "use server";

  const supabase = await createServerClient();
  const { user, workspace } = await getCurrentWorkspace({ supabase });

  const customer_id = String(formData.get("customer_id"));
  const title = String(formData.get("title") || "").trim() || null;
  const description_raw = String(formData.get("description_raw") || "").trim();
  const category = String(formData.get("category") || "").trim() || null;
  const urgency = String(formData.get("urgency") || "flexible");

  if (!customer_id) throw new Error("Customer is required");
  if (!description_raw) throw new Error("Job description is required");

  // Server action: validate required fields and create lead/job scoped to workspace_id so staff members can act (role enforced upstream via getCurrentWorkspace).
  const { data: inserted, error } = await supabase.from("jobs").insert({
    user_id: user.id,
    customer_id,
    title,
    description_raw,
    category,
    urgency,
    status: "lead",
    source: "manual",
    workspace_id: workspace.id,
  }).select("id").maybeSingle();

  if (error) throw new Error(error.message);

  // Audit: job created manually
  await logAuditEvent({
    supabase,
    workspaceId: workspace.id,
    actorUserId: user.id,
    action: "job_created",
    entityType: "job",
    entityId: inserted?.id ?? null,
    metadata: { source: "manual" },
  });

  redirect("/jobs");
}

export default async function NewJobPage() {
  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .order("name");

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1>New job</h1>
        <p className="hb-muted">Create a new lead or job.</p>
      </div>

      <form action={createJob} className="hb-card space-y-4">
        <div>
          <label className="hb-label" htmlFor="customer_id">Customer *</label>
          <select id="customer_id" name="customer_id" required className="hb-input">
            <option value="">Select a customer...</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="hb-label" htmlFor="title">Job title</label>
          <input id="title" name="title" className="hb-input" />
        </div>

        <div>
          <label className="hb-label" htmlFor="description_raw">Job description *</label>
          <textarea id="description_raw" name="description_raw" className="hb-textarea" required />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="hb-label" htmlFor="category">Category</label>
            <input id="category" name="category" className="hb-input" />
          </div>
          <div>
            <label className="hb-label" htmlFor="urgency">Urgency</label>
            <select id="urgency" name="urgency" className="hb-input" defaultValue="flexible">
              <option value="today">Today</option>
              <option value="this_week">This week</option>
              <option value="flexible">Flexible</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Link href="/jobs" className="hb-button-ghost">
            Cancel
          </Link>
          <button className="hb-button">Save job</button>
        </div>
      </form>
    </div>
  );
}
