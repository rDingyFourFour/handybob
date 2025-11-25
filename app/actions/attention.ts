"use server";

import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";

export async function dismissAttentionItem(formData: FormData) {
  const supabase = await createServerClient();
  const itemType = String(formData.get("itemType") || "");
  const itemId = formData.get("itemId");
  if (!itemId) return;

  const tableMap: Record<string, { table: string; updates: Record<string, string> }> = {
    lead: { table: "jobs", updates: { status: "archived" } },
    quote: { table: "quotes", updates: { status: "archived" } },
    invoice: { table: "invoices", updates: { status: "archived" } },
    call: { table: "calls", updates: { status: "archived" } },
  };
  const entry = tableMap[itemType];
  if (!entry) return;

  await supabase
    .from(entry.table)
    .update(entry.updates)
    .eq("id", String(itemId));

  revalidatePath("/");
}
