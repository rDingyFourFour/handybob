import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import NewCustomerForm from "./NewCustomerForm";

export default async function NewCustomerPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[new-customer] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[new-customer] Failed to resolve the user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[new-customer] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!workspace) {
    redirect("/");
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customers</p>
        <h1 className="hb-heading-1 text-3xl font-semibold">Add a new customer</h1>
        <p className="hb-muted text-sm">
          Give this person a profile so you can link them to jobs, quotes, calls, and messages.
        </p>
        <p className="text-sm text-slate-400">
          Only the name is required right now; we’ll fill in contact info later when you follow up.
        </p>
      </HbCard>
      <HbCard className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Create customer</p>
          <h2 className="hb-heading-2 text-xl font-semibold">Personal details</h2>
          <p className="text-sm text-slate-400">
            Use a real name so we can match future jobs, calls, and messages to this profile.
          </p>
        </div>
        <NewCustomerForm />
      </HbCard>
    </div>
  );
}
