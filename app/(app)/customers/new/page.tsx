import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";

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
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customers</p>
        <h1 className="hb-heading-1 text-3xl font-semibold">Add a new customer</h1>
        <p className="hb-muted text-sm">Customer creation form coming soon.</p>
      </HbCard>
    </div>
  );
}
