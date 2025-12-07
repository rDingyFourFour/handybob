import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import AskBobForm from "@/components/askbob/AskBobForm";
import AskBobPageEntryLogger from "@/components/askbob/AskBobPageEntryLogger";

export const dynamic = "force-dynamic";

export default async function AskBobPage() {
  let supabaseClient;
  try {
    supabaseClient = await createServerClient();
  } catch (error) {
    console.error("[askbob] Failed to create Supabase client:", error);
    return renderErrorCard(
      "AskBob unavailable",
      "Could not connect to Supabase. Please try again later."
    );
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabaseClient.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[askbob] Failed to fetch user:", error);
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    const workspaceResult = await getCurrentWorkspace({ supabase: supabaseClient });
    workspace = workspaceResult.workspace;
  } catch (error) {
    console.error("[askbob] Failed to resolve workspace:", error);
    return renderErrorCard(
      "AskBob unavailable",
      "Unable to resolve workspace. Please sign in again."
    );
  }

  if (!workspace) {
    return renderErrorCard(
      "AskBob unavailable",
      "Unable to resolve workspace. Please sign in again."
    );
  }

  return (
    <>
      <AskBobPageEntryLogger workspaceId={workspace.id} />
      <div className="hb-shell pt-20 pb-8 space-y-6">
        <div className="space-y-3">
          <h1 className="hb-heading-1 text-3xl font-semibold">AskBob</h1>
          <p className="hb-muted text-sm">
            Describe a technical problem and AskBob will suggest steps, materials, safety cautions, and
            escalation guidance.
          </p>
        </div>
        <AskBobForm workspaceId={workspace.id} />
      </div>
    </>
  );
}

function renderErrorCard(title: string, subtitle: string) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{subtitle}</p>
      </HbCard>
    </div>
  );
}
