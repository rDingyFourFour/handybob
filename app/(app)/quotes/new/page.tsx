export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

async function createQuoteAction(formData: FormData) {
  "use server";
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.error("[quotes/new] No authenticated user");
    return { ok: false };
  }
  const { workspace } = await getCurrentWorkspace({ supabase });
  if (!workspace) {
    console.error("[quotes/new] Failed to resolve workspace inside action");
    redirect("/");
  }

  const totalRaw = formData.get("total");
  const statusRaw = formData.get("status");
  const jobIdRaw = formData.get("job_id");
  const messageRaw = formData.get("client_message_template");

  const jobId = typeof jobIdRaw === "string" ? jobIdRaw.trim() : "";
  if (!jobId) {
    console.error("[quotes/new] Missing job_id – cannot create quote due to NOT NULL constraint");
    redirect("/quotes/new?error=job_id_required");
    return { ok: false, error: "JOB_ID_REQUIRED" };
  }

  const total =
    typeof totalRaw === "string" && totalRaw.trim() !== "" && !Number.isNaN(Number(totalRaw))
      ? Number(totalRaw)
      : 0;
  const status = typeof statusRaw === "string" && statusRaw.trim() ? statusRaw : "draft";
  const message =
    typeof messageRaw === "string" && messageRaw.trim() ? messageRaw.trim() : null;

  try {
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        user_id: user.id,
        job_id: jobId,
        status,
        total,
        client_message_template: message,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[quotes/new] Failed to create quote:", error);
      return { ok: false };
    }
    if (data?.id) {
      redirect(`/quotes/${data.id}`);
    } else {
      redirect("/quotes");
    }
  } catch (error) {
    console.error("[quotes/new] Failed to create quote:", error);
    return { ok: false };
  }
}

export default async function NewQuotePage(props: {
  searchParams: Promise<{ error?: string; jobId?: string }>;
}) {
  const searchParams = await props.searchParams;
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[quotes/new] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[quotes/new] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[quotes/new] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!workspace) {
    redirect("/");
  }

  const hasJobIdError = searchParams?.error === "job_id_required";
  const jobIdPrefill = searchParams?.jobId ?? "";

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Quotes</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Create a quote</h1>
          <p className="hb-muted text-sm">
            Estimate the work so you can send a clear proposal to your customer.
          </p>
        </div>
        <Link
          href="/quotes"
          className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
        >
          ← Back to quotes
        </Link>
      </header>
      <HbCard className="space-y-4">
        <form action={createQuoteAction} className="space-y-4">
          {hasJobIdError && (
            <p className="text-xs text-rose-400">
              Please select or enter a job before creating a quote.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="total" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Total
              </label>
              <input
                id="total"
                name="total"
                type="number"
                step="0.01"
                placeholder="1200"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-slate-500">Leave blank if you still need to finalize pricing.</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="status" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue="draft"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="job_id" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Job id (required)
            </label>
            <input
              id="job_id"
              name="job_id"
              type="text"
              placeholder="Link to an existing job"
              defaultValue={jobIdPrefill || undefined}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              required
            />
            <p className="text-[11px] text-slate-500">
              Quotes must be attached to a job. Paste a job ID for now; later we’ll add a picker.
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="client_message_template"
              className="text-xs uppercase tracking-[0.3em] text-slate-500"
            >
              Message to customer (optional)
            </label>
            <textarea
              id="client_message_template"
              name="client_message_template"
              rows={3}
              placeholder="Thank you for considering HandyBob..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
            <HbButton type="submit">Create quote</HbButton>
            <Link href="/quotes" className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100">
              Cancel
            </Link>
          </div>
        </form>
      </HbCard>
    </div>
  );
}
