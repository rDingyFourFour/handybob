"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

export async function createInvoice(formData: FormData) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  const { workspace } = await getCurrentWorkspace({ supabase });

  const jobIdRaw = formData.get("jobId");
  const quoteIdRaw = formData.get("quoteId");
  const totalRaw = formData.get("total");
  const statusRaw = formData.get("status");

  const jobId = typeof jobIdRaw === "string" && jobIdRaw.trim() ? jobIdRaw.trim() : null;
  const quoteId = typeof quoteIdRaw === "string" && quoteIdRaw.trim() ? quoteIdRaw.trim() : null;
  const status =
    typeof statusRaw === "string" && statusRaw.trim() ? statusRaw.trim().toLowerCase() : "draft";
  const totalValue =
    typeof totalRaw === "string" && totalRaw.trim() ? Number.parseFloat(totalRaw) : NaN;
  if (Number.isNaN(totalValue)) {
    throw new Error("A total amount is required.");
  }

  const { error, data } = await supabase
    .from("invoices")
    .insert({
      user_id: user.id,
      workspace_id: workspace.id,
      job_id: jobId,
      quote_id: quoteId,
      total: totalValue,
      subtotal: totalValue,
      tax: 0,
      status,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.error("[invoices/create] Failed to create invoice:", error);
    throw new Error("Unable to create invoice right now.");
  }

  revalidatePath("/invoices");
  if (jobId) {
    revalidatePath(`/jobs/${jobId}`);
  }

  redirect(`/invoices/${data.id}`);
}
