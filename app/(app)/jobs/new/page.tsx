export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

async function createJobAction(formData: FormData) {
  "use server";
  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  const { workspace } = workspaceContext;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("[jobs/new] No authenticated user when creating job", userError);
    redirect("/");
  }

  if (!workspace) {
    console.error("[jobs/new] Failed to resolve workspace inside action");
    redirect("/");
  }

  const customerIdRaw = formData.get("customerId");
  const customerId =
    typeof customerIdRaw === "string" && customerIdRaw.trim() ? customerIdRaw.trim() : "";
  if (!customerId) {
    console.error("[jobs/new] Missing customerId in form submission");
    return { ok: false, message: "Customer is required." };
  }

  const titleRaw = formData.get("title");
  const descriptionField = formData.get("description");
  const statusRaw = formData.get("status");

  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  const status = typeof statusRaw === "string" && statusRaw.trim() ? statusRaw.trim() : "lead";

  if (!title) {
    return { ok: false, message: "Title is required." };
  }

  const normalizedDescription =
    typeof descriptionField === "string" && descriptionField.trim().length > 0
      ? descriptionField.trim()
      : "New job";

  try {
    const { error } = await supabase
      .from("jobs")
      .insert({
        user_id: user.id,
        workspace_id: workspace.id,
        title,
        status,
        description_raw: normalizedDescription,
        customer_id: customerId,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[jobs/new] Failed to create job:", error);
      return { ok: false, message: "Could not create job. Please try again." };
    }
  } catch (error) {
    console.error("[jobs/new] Failed to create job:", error);
    return { ok: false, message: "Could not create job. Please try again." };
  }

  redirect("/jobs");
}

export default async function NewJobPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[jobs/new] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[jobs/new] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[jobs/new] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!workspace) {
    redirect("/");
  }

  const { data: customersData } = await supabase
    .from("customers")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .order("name");
  const customers = (customersData ?? []) as { id: string; name: string | null }[];

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Jobs</p>
        <h1 className="hb-heading-1 text-3xl font-semibold">Create a job</h1>
        <p className="hb-muted text-sm">
          Start by capturing a lead or active job. You can send quotes and schedule work from here later.
        </p>
      </header>
      <HbCard className="space-y-4">
        <form action={createJobAction} className="space-y-5">
          {customers.length === 0 && (
            <div className="text-sm text-rose-400">
              No customers in this workspace. Create a customer first to assign a job.
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
              <label htmlFor="title">Job title</label>
              <span className="text-slate-400">Required</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Something you’ll recognize in your schedule or billing.
            </p>
            <input
              id="title"
              name="title"
              type="text"
              placeholder="Fix irrigation leak"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="customerId" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Customer
            </label>
            <select
              id="customerId"
              name="customerId"
              required
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Select a customer…
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name ?? "(No name)"}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="description" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Job description
            </label>
            <p className="text-[11px] text-slate-500">
              Optional notes about the scope, location, or special considerations.
            </p>
            <textarea
              id="description"
              name="description"
              placeholder="Example: needs a new valve, customer prefers mornings"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              rows={4}
            />
          </div>
          <input type="hidden" name="status" value="lead" />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
            <HbButton type="submit">Create job</HbButton>
            <Link href="/jobs" className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100">
              Cancel
            </Link>
          </div>
        </form>
      </HbCard>
    </div>
  );
}
