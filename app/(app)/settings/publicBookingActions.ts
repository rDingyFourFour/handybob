"use server";

import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace, requireOwner } from "@/lib/domain/workspaces";

export type PublicBookingToggleState = {
  status: "idle" | "success" | "error";
  enabled: boolean;
  message: string | null;
  code: string | null;
};

export async function updatePublicBookingStatus(
  previousState: PublicBookingToggleState,
  formData: FormData
): Promise<PublicBookingToggleState> {
  const enabledRaw = formData.get("enabled");
  if (typeof enabledRaw !== "string") {
    return {
      ...previousState,
      status: "error",
      message: "Missing booking preference.",
      code: "missing_preference",
    };
  }

  const nextEnabled = enabledRaw === "true";

  try {
    const supabase = await createServerClient();
    const workspaceContext = await getCurrentWorkspace({ supabase });

    if (!workspaceContext.workspace || !workspaceContext.user || !workspaceContext.role) {
      return {
        ...previousState,
        status: "error",
        message: "Please sign in to update booking settings.",
        code: "unauthenticated",
      };
    }

    requireOwner({
      user: workspaceContext.user,
      workspace: workspaceContext.workspace,
      role: workspaceContext.role,
    });

    const { data, error } = await supabase
      .from("workspaces")
      .update({ public_lead_form_enabled: nextEnabled })
      .eq("id", workspaceContext.workspace.id)
      .select("public_lead_form_enabled")
      .maybeSingle();

    if (error) {
      console.error("[bookings-enable-toggle] Failed to update workspace", error);
      return {
        ...previousState,
        status: "error",
        message: "We couldn’t update bookings right now.",
        code: "update_failed",
      };
    }

    const updatedEnabled =
      data && typeof data.public_lead_form_enabled === "boolean"
        ? data.public_lead_form_enabled
        : nextEnabled;

    revalidatePath("/settings");

    return {
      status: "success",
      enabled: updatedEnabled,
      message: null,
      code: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      ...previousState,
      status: "error",
      message,
      code: "unauthorized",
    };
  }
}
