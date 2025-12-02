"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

export type CallScriptDescriptor = {
  subject?: string | null;
  opening?: string | null;
  keyPoints?: string[] | null;
  closing?: string | null;
  outcome?: string | null;
};

export type CreatePhoneCallMessageActionInput = {
  jobId: string;
  quoteId: string;
  workspaceId?: string | null;
  subject: string;
  noteBody?: string;
  script?: CallScriptDescriptor;
};

export type PhoneCallMessageActionResult =
  | { ok: true; messageId: string; error: null }
  | { ok: false; messageId: null; error: "auth_error" | "db_error" | "validation_error" };

function normalizeText(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function buildCallLogBody(script: CallScriptDescriptor, subject: string, agentName: string): string {
  const now = new Date();
  const timestamp = now.toISOString();
  const callType = "Quote follow-up";
  const normalizedOutcome =
    normalizeText(script.outcome) ||
    "TODO (e.g., Left voicemail / Talked to customer / No answer)";
  const normalizedSubject = normalizeText(script.subject ?? subject);
  const opening = normalizeText(script.opening);
  const closing = normalizeText(script.closing);
  const keyPoints = (script.keyPoints ?? [])
    .map((point) => normalizeText(point))
    .filter(Boolean);

  const trimmedAgent = agentName.trim();
  const lines: string[] = [];
  lines.push(`Call type: ${callType}`);
  lines.push(`Outcome: ${normalizedOutcome}`);
  lines.push(`When: ${timestamp}`);
  if (trimmedAgent) {
    lines.push(`Agent: ${trimmedAgent}`);
  }
  lines.push("");
  lines.push("Planned talking points:");
  lines.push("");
  if (normalizedSubject) {
    lines.push(`Subject: ${normalizedSubject}`);
    lines.push("");
  }
  if (opening) {
    lines.push("Opening:");
    lines.push(opening);
    lines.push("");
  }
  if (keyPoints.length) {
    lines.push("Key points:");
    keyPoints.forEach((point, index) => {
      lines.push(`  ${index + 1}. ${point}`);
    });
    lines.push("");
  }
  if (closing) {
    lines.push("Closing:");
    lines.push(closing);
  }
  return lines.join("\n").trim();
}

export async function createPhoneCallMessageAction(
  input: CreatePhoneCallMessageActionInput
): Promise<PhoneCallMessageActionResult> {
  const jobId = normalizeText(input.jobId);
  const quoteId = normalizeText(input.quoteId);
  const subject = normalizeText(input.subject);
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    console.warn("[phone-call-message-action] No user in session", { jobId, quoteId });
    return { ok: false, messageId: null, error: "auth_error" };
  }

  const agentName = user.email ?? user.id;
  const scriptBody =
    input.script && agentName
      ? buildCallLogBody(input.script, subject, agentName)
      : "";
  let body = scriptBody;
  if (!body) {
    body = normalizeText(input.noteBody ?? "");
  }
  const subjectLength = subject.length;
  const bodyLength = body.length;

  console.log("[phone-call-message-action] createPhoneCallMessageAction called", {
    jobId,
    quoteId,
    subjectLength,
    bodyLength,
  });
  if (!jobId || !subject || !body) {
    console.warn("[phone-call-message-action] Validation failed", {
      jobId,
      subjectLength,
      bodyLength,
    });
    return { ok: false, messageId: null, error: "validation_error" };
  }
  let resolvedWorkspaceId = normalizeText(input.workspaceId ?? null);
  if (!resolvedWorkspaceId) {
    try {
      const { workspace } = await getCurrentWorkspace({ supabase });
      resolvedWorkspaceId = workspace?.id ?? "";
    } catch (error) {
      console.error("[phone-call-message-action] Failed to resolve workspace", error);
      return { ok: false, messageId: null, error: "validation_error" };
    }
  }

  if (!resolvedWorkspaceId) {
    console.error("[phone-call-message-action] Workspace ID missing");
    return { ok: false, messageId: null, error: "validation_error" };
  }

  try {
    const channel = "phone";
    const via = "email";
    const { data, error } = await supabase
      .from("messages")
      .insert({
        workspace_id: resolvedWorkspaceId,
        user_id: user.id,
        job_id: jobId,
        quote_id: quoteId,
        direction: "outbound",
        status: "draft",
        channel,
        via,
        subject,
        outcome: normalizeText(input.script?.outcome ?? null),
        body,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("[phone-call-message-action] Message insert failed", {
        error,
        jobId,
        quoteId,
        workspaceId: resolvedWorkspaceId,
        userId: user.id,
        channel,
        via,
      });
      return { ok: false, messageId: null, error: "db_error" };
    }

    console.log("[phone-call-message-action] Message saved", {
      messageId: data.id,
      jobId,
      quoteId,
      workspaceId: resolvedWorkspaceId,
      userId: user.id,
      channel,
      via,
      subjectLength,
      bodyLength,
    });

    return { ok: true, messageId: data.id, error: null };
  } catch (error) {
    console.error("[phone-call-message-action] Unexpected error", error);
    return { ok: false, messageId: null, error: "db_error" };
  }
}

export type UpdateMessageOutcomeActionInput = {
  messageId: string;
  outcome: string | null;
  workspaceId?: string | null;
};

export async function updateMessageOutcomeAction(
  input: UpdateMessageOutcomeActionInput
): Promise<{ ok: boolean; error?: string }> {
  const messageId = normalizeText(input.messageId);
  if (!messageId) {
    console.warn("[phone-call-message-action] update outcome failed: missing messageId");
    return { ok: false, error: "validation_error" };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    console.warn("[phone-call-message-action] No user in session", { messageId });
    return { ok: false, error: "auth_error" };
  }

  let resolvedWorkspaceId = normalizeText(input.workspaceId ?? null);
  if (!resolvedWorkspaceId) {
    try {
      const { workspace } = await getCurrentWorkspace({ supabase });
      resolvedWorkspaceId = workspace?.id ?? "";
    } catch (error) {
      console.error("[phone-call-message-action] Failed to resolve workspace", error);
      return { ok: false, error: "validation_error" };
    }
  }

  if (!resolvedWorkspaceId) {
    console.error("[phone-call-message-action] Workspace ID missing");
    return { ok: false, error: "validation_error" };
  }

  const normalizedOutcome = normalizeText(input.outcome ?? null) || null;

  const { error } = await supabase
    .from("messages")
    .update({
      outcome: normalizedOutcome,
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("workspace_id", resolvedWorkspaceId);

  if (error) {
    console.error("[phone-call-message-action] Failed to update message outcome", {
      error,
      messageId,
      workspaceId: resolvedWorkspaceId,
    });
    return { ok: false, error: "db_error" };
  }

  return { ok: true };
}
