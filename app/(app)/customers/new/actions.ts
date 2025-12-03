"use server";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

export async function createCustomerAction(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const phone = (formData.get("phone") as string | null)?.trim() ?? "";

  if (!name) {
    throw new Error("Please provide a name for this customer.");
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[new-customer] Failed to initialize Supabase client:", error);
    throw new Error("Unable to start the request. Please try again.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    console.error("[new-customer] Failed to resolve user:", userError);
    throw new Error("Unable to resolve your account. Please try reloading.");
  }
  if (!user) {
    redirect("/");
    return;
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[new-customer] Failed to resolve workspace:", error);
    throw new Error("Unable to resolve workspace. Please try again.");
  }

  if (!workspace) {
    throw new Error("Workspace is unavailable.");
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      workspace_id: workspace.id,
      user_id: user.id,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[new-customer] Insert failed:", error);
    throw new Error("Unable to create a customer. Please try again.");
  }

  if (!data?.id) {
    throw new Error("Customer creation failed. Please try again.");
  }

  redirect(`/customers/${data.id}`);
}
