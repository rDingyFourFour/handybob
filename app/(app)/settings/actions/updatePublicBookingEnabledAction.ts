"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";

const UpdatePublicBookingEnabledSchema = z.object({
  enabled: z.boolean(),
});

export type UpdatePublicBookingEnabledPayload = z.infer<
  typeof UpdatePublicBookingEnabledSchema
>;

type UpdatePublicBookingEnabledSuccess = {
  success: true;
  enabled: boolean;
};

type UpdatePublicBookingEnabledFailure = {
  success: false;
  code: string;
  message: string;
};

export type UpdatePublicBookingEnabledResult =
  | UpdatePublicBookingEnabledSuccess
  | UpdatePublicBookingEnabledFailure;

export async function updatePublicBookingEnabledAction(
  payload: UpdatePublicBookingEnabledPayload,
): Promise<UpdatePublicBookingEnabledResult> {
  const parsed = UpdatePublicBookingEnabledSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn("[settings-booking-toggle-failure]", {
      workspaceId: null,
      userId: null,
      enabled: payload?.enabled ?? null,
      errorCode: "invalid_payload",
    });
    return {
      success: false,
      code: "invalid_payload",
      message: "Booking preferences are invalid.",
    };
  }

  const { enabled } = parsed.data;
  const supabase = await createServerClient();
  const workspaceResult = await resolveWorkspaceContext({
    supabase,
    allowAutoCreateWorkspace: false,
  });

  const workspaceId = workspaceResult.ok
    ? workspaceResult.workspaceId
    : null;
  const userId = workspaceResult.ok ? workspaceResult.userId : null;

  console.log("[settings-booking-toggle-request]", {
    workspaceId,
    userId,
    enabled,
  });

  if (!workspaceResult.ok) {
    const code =
      workspaceResult.code === "unauthenticated"
        ? "unauthenticated"
        : workspaceResult.code === "no_membership"
        ? "forbidden"
        : workspaceResult.code === "workspace_not_found"
        ? "workspace_not_found"
        : "unknown";

    console.warn("[settings-booking-toggle-failure]", {
      workspaceId,
      userId,
      enabled,
      errorCode: code,
    });

    return {
      success: false,
      code,
      message:
        code === "unauthenticated"
          ? "Please sign in to update bookings."
          : code === "forbidden"
          ? "You do not have access to this workspace."
          : "Workspace context is unavailable.",
    };
  }

  const { workspace, role } = workspaceResult.membership;

  if (role !== "owner") {
    console.warn("[settings-booking-toggle-failure]", {
      workspaceId,
      userId,
      enabled,
      errorCode: "forbidden",
    });
    return {
      success: false,
      code: "forbidden",
      message: "You do not have access to update bookings.",
    };
  }

  try {
    const { data: workspaceRow, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, public_lead_form_enabled")
      .eq("id", workspace.id)
      .maybeSingle();

    if (workspaceError) {
      console.warn("[settings-booking-toggle-failure]", {
        workspaceId,
        userId,
        enabled,
        errorCode: "workspace_lookup_failed",
      });
      return {
        success: false,
        code: "workspace_lookup_failed",
        message: "We couldn’t update bookings right now.",
      };
    }

    const currentEnabled = workspaceRow
      ? workspaceRow.public_lead_form_enabled !== false
      : null;

    if (workspaceRow && currentEnabled === enabled) {
      console.log("[settings-booking-toggle-success]", {
        workspaceId,
        userId,
        enabled,
        noChange: true,
      });
      return { success: true, enabled };
    }

    const { data, error } = await supabase
      .from("workspaces")
      .update({ public_lead_form_enabled: enabled })
      .eq("id", workspace.id)
      .select("public_lead_form_enabled")
      .maybeSingle();

    if (error) {
      console.warn("[settings-booking-toggle-failure]", {
        workspaceId,
        userId,
        enabled,
        errorCode: "update_failed",
      });
      return {
        success: false,
        code: "update_failed",
        message: "We couldn’t update bookings right now.",
      };
    }

    if (!data) {
      console.warn("[settings-booking-toggle-failure]", {
        workspaceId,
        userId,
        enabled,
        errorCode: "workspace_not_found",
      });
      return {
        success: false,
        code: "workspace_not_found",
        message: "Workspace context is unavailable.",
      };
    }

    const updatedEnabled = data.public_lead_form_enabled !== false;

    console.log("[settings-booking-toggle-success]", {
      workspaceId,
      userId,
      enabled: updatedEnabled,
    });

    return { success: true, enabled: updatedEnabled };
  } catch {
    const errorCode = "unknown";
    console.warn("[settings-booking-toggle-failure]", {
      workspaceId,
      userId,
      enabled,
      errorCode,
    });
    return {
      success: false,
      code: errorCode,
      message: "We couldn’t update bookings right now.",
    };
  }
}
