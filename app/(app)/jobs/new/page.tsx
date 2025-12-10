export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import JobNewPageClient from "./JobNewPageClient";

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

export default async function NewJobPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  const askBobTitleParam = searchParams?.title;
  const askBobDescriptionParam = searchParams?.description;
  const askBobOriginParam = searchParams?.origin;
  const askBobTitle =
    typeof askBobTitleParam === "string" && askBobTitleParam.trim()
      ? askBobTitleParam.trim()
      : "";
  const askBobDescription =
    typeof askBobDescriptionParam === "string" && askBobDescriptionParam.trim()
      ? askBobDescriptionParam.trim()
      : "";
  const askBobOrigin = typeof askBobOriginParam === "string" ? askBobOriginParam : null;
  const rawCustomerId = searchParams?.customerId;
  const requestedCustomerId = Array.isArray(rawCustomerId) ? rawCustomerId[0] : rawCustomerId ?? null;
  const customerIdFromQuery = requestedCustomerId?.trim() ? requestedCustomerId.trim() : null;

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

  if (askBobOrigin === "askbob") {
    console.log("[jobs-new-from-askbob]", {
      workspaceId: workspace.id,
      hasTitlePrefill: Boolean(askBobTitle),
      hasDescriptionPrefill: Boolean(askBobDescription),
      titleLength: askBobTitle.length,
      descriptionLength: askBobDescription.length,
    });
  }

  const { data: customersData } = await supabase
    .from("customers")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .order("name");
  const customers = (customersData ?? []) as { id: string; name: string | null }[];

  let customerFromQuery: { id: string; name: string | null } | null = null;
  if (customerIdFromQuery) {
    try {
      const { data: customerRow, error: customerError } = await supabase
        .from("customers")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .eq("id", customerIdFromQuery)
        .maybeSingle();
      if (customerError) {
        console.error("[jobs/new] Failed to load customer from query", customerError);
      } else {
        customerFromQuery = customerRow ?? null;
      }
    } catch (error) {
      console.error("[jobs/new] Customer lookup failed", error);
    }
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Jobs</p>
        <h1 className="hb-heading-1 text-3xl font-semibold">Create a job</h1>
        <p className="hb-muted text-sm">
          Start by capturing a lead or active job. You can send quotes and schedule work from here later.
        </p>
        {customerFromQuery && (
          <p className="text-sm text-slate-400">
            You’re creating a job for {customerFromQuery.name ?? customerFromQuery.id}.
          </p>
        )}
      </header>
      <JobNewPageClient
        customers={customers}
        createJobAction={createJobAction}
        workspaceId={workspace.id}
        selectedCustomer={customerFromQuery}
        initialTitle={askBobTitle}
        initialDescription={askBobDescription}
        askBobOrigin={askBobOrigin}
      />
    </div>
  );
}
