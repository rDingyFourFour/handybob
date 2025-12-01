"use server";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

function clampNumberInput(value: unknown): number {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value < 0 ? 0 : value;
    }
    return 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      return 0;
    }
    return parsed < 0 ? 0 : parsed;
  }
  return 0;
}

export async function createQuoteAction(formData: FormData) {
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

  const subtotalRaw = formData.get("subtotal");
  const taxRaw = formData.get("tax");
  const totalRaw = formData.get("total");
  const statusRaw = formData.get("status");
  const jobIdRaw = formData.get("job_id");
  const messageRaw = formData.get("client_message_template");
  const smartQuoteUsedRaw = formData.get("smart_quote_used");

  const jobId = typeof jobIdRaw === "string" ? jobIdRaw.trim() : "";
  if (!jobId) {
    console.error("[quotes/new] Missing job_id – cannot create quote due to NOT NULL constraint");
    redirect("/quotes/new?error=job_id_required");
    return { ok: false, error: "JOB_ID_REQUIRED" };
  }

  const subtotalValue = clampNumberInput(subtotalRaw);
  const taxValue = clampNumberInput(taxRaw);
  const totalValue = subtotalValue + taxValue;
  const status = typeof statusRaw === "string" && statusRaw.trim() ? statusRaw : "draft";
  const message =
    typeof messageRaw === "string" && messageRaw.trim() ? messageRaw.trim() : null;
  const smartQuoteUsed = smartQuoteUsedRaw === "true";

  console.log("[quotes/new] form amounts", {
    subtotalRaw,
    subtotal: subtotalValue,
    taxRaw,
    tax: taxValue,
    totalRaw,
    total: totalValue,
  });

  try {
    const { data, error } = await supabase
      .from("quotes")
          .insert({
            user_id: user.id,
            job_id: jobId,
            status,
            subtotal: subtotalValue,
            tax: taxValue,
            total: totalValue,
            client_message_template: message,
            smart_quote_used: smartQuoteUsed,
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
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("[quotes/new] Failed to create quote:", error);
    return { ok: false };
  }
}
