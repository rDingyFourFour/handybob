"use server";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

export type CreateFollowupMessageActionInput = {
  quoteId: string;
  jobId?: string | null;
  workspaceId?: string | null;
  subject: string;
  body: string;
};

export type CreateFollowupMessageActionResult = {
  ok: boolean;
  error?: string | null;
};

function parseFormValue(value: FormDataEntryValue | null): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

export async function createFollowupMessageAction(
  formData: FormData
): Promise<CreateFollowupMessageActionResult | never> {
  const quoteId = parseFormValue(formData.get("quote_id"));
  const jobId = parseFormValue(formData.get("job_id")) || null;
  const workspaceIdFromForm = parseFormValue(formData.get("workspace_id")) || null;
  const subject = parseFormValue(formData.get("followup_subject"));
  const body = parseFormValue(formData.get("followup_body"));

  console.log("[followup-message-action] createFollowupMessageAction called", {
    quoteId,
    jobId,
    subjectLength: subject.length,
    bodyLength: body.length,
  });

  if (!quoteId) {
    console.warn("[followup-message-action] Missing quote_id");
    return { ok: false, error: "missing_quote" };
  }

  if (!subject || !body) {
    console.warn("[followup-message-action] Empty followup payload", {
      quoteId,
      subjectLength: subject.length,
      bodyLength: body.length,
    });
    return { ok: false, error: "empty_followup" };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  if (!userId) {
    console.warn("[followup-message-action] No user in session", { quoteId, jobId });
    return { ok: false, error: "unauthenticated" };
  }

  let resolvedWorkspaceId = workspaceIdFromForm;
  if (!resolvedWorkspaceId) {
    try {
      const { workspace } = await getCurrentWorkspace({ supabase });
      resolvedWorkspaceId = workspace?.id ?? null;
    } catch (error) {
      console.error("[followup-message-action] Failed to resolve workspace", error);
      return { ok: false, error: "workspace_resolution" };
    }
  }

  if (!resolvedWorkspaceId) {
    console.error("[followup-message-action] Workspace ID missing");
    return { ok: false, error: "workspace_missing" };
  }

  try {
    const channel = "email";
    const via = "email";
    const { data, error } = await supabase
      .from("messages")
      .insert({
        workspace_id: resolvedWorkspaceId,
        user_id: userId,
        quote_id: quoteId,
        job_id: jobId,
        direction: "outbound",
        status: "draft",
        subject,
        body,
        channel,
        via,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("[followup-message-action] Message insert failed", {
        error,
        quoteId,
        jobId,
        workspaceId: resolvedWorkspaceId,
        userId,
        channel,
        via,
      });
      return { ok: false, error: "insert_failed" };
    }

    console.log("[followup-message-action] Message draft saved", {
      messageId: data.id,
      quoteId,
      jobId,
      workspaceId: resolvedWorkspaceId,
      userId,
    });

    redirect("/messages");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("[followup-message-action] Unexpected error", error);
    return { ok: false, error: "insert_failed" };
  }
}
