"use server";

import { createServerClient } from "@/utils/supabase/server";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import type {
  AskBobDiagnoseSnapshotPayload,
  AskBobMaterialsSnapshotPayload,
  AskBobQuoteGenerateInput,
  AskBobQuoteGenerateResult,
  AskBobTaskContext,
} from "@/lib/domain/askbob/types";
import { adaptAskBobQuoteToSmartQuote, SmartQuoteSuggestion } from "@/lib/domain/quotes/askbob-adapter";
import {
  getJobTaskSnapshotsForJob,
  getLatestJobTaskSnapshotVersion,
} from "@/lib/domain/askbob/repository";
import {
  buildDiagnosisSummaryFromSnapshot,
  buildMaterialsSummaryFromSnapshot,
} from "@/lib/domain/askbob/summary";
import { formatSnapshotTimestamp } from "@/lib/domain/askbob/formatters";

type QuoteGeneratePayload = {
  jobId: string;
  prompt: string;
  extraDetails?: string | null;
  hasDiagnosisContext?: boolean;
  hasMaterialsContext?: boolean;
  hasJobDescriptionContext?: boolean;
  hasMaterialsSummary?: boolean;
  hasDiagnosisSummary?: boolean;
  jobTitle?: string | null;
  diagnosisSummary?: string | null;
  materialsSummary?: string | null;
};

export type QuoteGenerateActionResult = {
  ok: true;
  jobId: string;
  suggestion: SmartQuoteSuggestion;
  modelLatencyMs: number;
  versionId: string;
  createdAt: string;
  createdAtLabel: string | null;
} | {
  ok: false;
  code:
    | "unauthenticated"
    | "forbidden"
    | "workspace_not_found"
    | "invalid_input"
    | "job_not_found"
    | "unknown";
  message: string;
};

export async function runAskBobQuoteGenerateAction(
  payload: QuoteGeneratePayload
): Promise<QuoteGenerateActionResult> {
  const trimmedJobId = payload.jobId?.trim() ?? "";
  const trimmedPrompt = payload.prompt?.trim() ?? "";
  const trimmedExtraDetails = payload.extraDetails?.trim() ?? "";
  const trimmedJobTitle = payload.jobTitle?.trim() ?? "";
  const normalizedJobTitle = trimmedJobTitle || null;
  const hasDiagnosisSummaryForQuote = Boolean(payload.diagnosisSummary?.trim());
  const hasMaterialsSummaryForQuote = Boolean(payload.materialsSummary?.trim());

  if (!trimmedJobId) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Job ID is required to generate a quote.",
    };
  }
  if (!trimmedPrompt) {
    return {
      ok: false,
      code: "invalid_input",
      message: "A short prompt describing the quote is required.",
    };
  }

  const supabase = await createServerClient();
  const workspaceResult = await resolveWorkspaceContext({
    supabase,
    allowAutoCreateWorkspace: false,
  });

  if (!workspaceResult.ok) {
    const code =
      workspaceResult.code === "unauthenticated"
        ? "unauthenticated"
        : workspaceResult.code === "workspace_not_found"
        ? "workspace_not_found"
        : workspaceResult.code === "no_membership"
        ? "forbidden"
        : "workspace_not_found";
    console.error("[askbob-quote-ui-failure] workspace unavailable", {
      jobId: trimmedJobId,
      reason: code,
    });
    return {
      ok: false,
      code,
      message: "Workspace context is unavailable.",
    };
  }

  const { workspace, user } = workspaceResult.membership;

  const { data: job } = await supabase
    .from("jobs")
    .select("id, customer_id")
    .eq("id", trimmedJobId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!job) {
    return { ok: false, code: "job_not_found", message: "Job not found." };
  }

  const context: AskBobTaskContext = {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    customerId: job.customer_id ?? null,
    quoteId: null,
  };

  console.log("[askbob-quote-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    promptLength: trimmedPrompt.length,
    hasExtraDetails: Boolean(trimmedExtraDetails),
    hasJobTitle: Boolean(normalizedJobTitle),
    hasDiagnosisContext: Boolean(payload.hasDiagnosisContext),
    hasMaterialsContext: Boolean(payload.hasMaterialsContext),
    hasJobDescriptionForQuote: Boolean(payload.hasJobDescriptionContext),
    hasMaterialsSummaryForQuote,
    hasDiagnosisSummaryForQuote,
  });

  const taskInput: AskBobQuoteGenerateInput = {
    task: "quote.generate",
    context,
    prompt: trimmedPrompt,
    extraDetails: trimmedExtraDetails || null,
    jobTitle: normalizedJobTitle,
  };

  try {
    const taskResult = (await runAskBobTask(supabase, taskInput)) as AskBobQuoteGenerateResult;

    const suggestion = adaptAskBobQuoteToSmartQuote(taskResult);
    const latestVersion = await getLatestJobTaskSnapshotVersion(supabase, {
      workspaceId: workspace.id,
      jobId: job.id,
      task: "quote.generate",
    });
    const createdAt = latestVersion?.created_at ?? new Date().toISOString();
    const versionId = latestVersion?.id ?? `${job.id}-${Date.now()}`;

    console.log("[askbob-quote-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      modelLatencyMs: taskResult.modelLatencyMs,
      linesCount: suggestion.scopeLines.length,
      materialsCount: suggestion.materials?.length ?? 0,
      hasJobDescriptionForQuote: Boolean(payload.hasJobDescriptionContext),
      hasMaterialsSummaryForQuote,
      hasDiagnosisSummaryForQuote,
      hasJobTitle: Boolean(normalizedJobTitle),
    });

    return {
      ok: true,
      jobId: job.id,
      suggestion,
      modelLatencyMs: taskResult.modelLatencyMs,
      versionId,
      createdAt,
      createdAtLabel: formatSnapshotTimestamp(createdAt),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedMessage =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-quote-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncatedMessage,
    });
    return {
      ok: false,
      code: "unknown",
      message: "AskBob couldn’t generate a quote. Please try again.",
    };
  }
}

type RegenerateQuoteActionResult = {
  ok: true;
  jobId: string;
  suggestion: SmartQuoteSuggestion;
  modelLatencyMs: number;
  versionId: string;
  createdAt: string;
  createdAtLabel: string | null;
} | {
  ok: false;
  code:
    | "unauthenticated"
    | "forbidden"
    | "workspace_not_found"
    | "invalid_input"
    | "job_not_found"
    | "missing_job_context"
    | "unknown";
  message: string;
};

const QUOTE_REGEN_PROMPT = "Generate a standard quote for this job.";

const buildJobDescriptionSnippet = (description?: string | null): string | null => {
  if (!description) {
    return null;
  }
  const trimmed = description.trim();
  if (!trimmed) {
    return null;
  }
  const singleLine = trimmed.replace(/\s+/g, " ");
  return singleLine.length > 320 ? `${singleLine.slice(0, 320)}...` : singleLine;
};

const buildQuoteRegenExtraDetails = ({
  jobTitle,
  jobDescription,
  diagnosisSummary,
  materialsSummary,
}: {
  jobTitle?: string | null;
  jobDescription?: string | null;
  diagnosisSummary?: string | null;
  materialsSummary?: string | null;
}): string | null => {
  const parts: string[] = [];
  if (jobTitle?.trim()) {
    parts.push(`Job title: ${jobTitle.trim()}`);
  }
  const descriptionSnippet = buildJobDescriptionSnippet(jobDescription);
  if (descriptionSnippet) {
    parts.push(`Job description: ${descriptionSnippet}`);
  }
  if (diagnosisSummary?.trim()) {
    parts.push(`Diagnosis summary: ${diagnosisSummary.trim()}`);
  }
  if (materialsSummary?.trim()) {
    parts.push(`Materials summary: ${materialsSummary.trim()}`);
  }
  return parts.length ? parts.join("\n\n") : null;
};

export async function regenerateAskBobQuoteAction(
  payload: { jobId: string }
): Promise<RegenerateQuoteActionResult> {
  const trimmedJobId = payload.jobId?.trim() ?? "";
  if (!trimmedJobId) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Job ID is required to regenerate a quote.",
    };
  }

  const supabase = await createServerClient();
  const workspaceResult = await resolveWorkspaceContext({
    supabase,
    allowAutoCreateWorkspace: false,
  });

  if (!workspaceResult.ok) {
    const code =
      workspaceResult.code === "unauthenticated"
        ? "unauthenticated"
        : workspaceResult.code === "workspace_not_found"
        ? "workspace_not_found"
        : workspaceResult.code === "no_membership"
        ? "forbidden"
        : "workspace_not_found";
    console.error("[askbob-quote-regenerate] workspace unavailable", {
      jobId: trimmedJobId,
      reason: code,
    });
    return {
      ok: false,
      code,
      message: "Workspace context is unavailable.",
    };
  }

  const { workspace, user } = workspaceResult.membership;
  const { data: job } = await supabase
    .from("jobs")
    .select("id, customer_id, title, description_raw")
    .eq("id", trimmedJobId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!job) {
    return { ok: false, code: "job_not_found", message: "Job not found." };
  }

  const snapshots = await getJobTaskSnapshotsForJob(supabase, {
    workspaceId: workspace.id,
    jobId: job.id,
  });
  const diagnosisSnapshot = snapshots.find((snapshot) => snapshot.task === "job.diagnose")?.payload ?? null;
  const materialsSnapshot = snapshots.find((snapshot) => snapshot.task === "materials.generate")?.payload ?? null;
  const diagnosisSummary = buildDiagnosisSummaryFromSnapshot(
    typeof diagnosisSnapshot === "object"
      ? (diagnosisSnapshot as AskBobDiagnoseSnapshotPayload)
      : null,
  );
  const materialsSummary = buildMaterialsSummaryFromSnapshot(
    typeof materialsSnapshot === "object"
      ? (materialsSnapshot as AskBobMaterialsSnapshotPayload)
      : null,
  );
  const extraDetails = buildQuoteRegenExtraDetails({
    jobTitle: job.title ?? null,
    jobDescription: job.description_raw ?? null,
    diagnosisSummary,
    materialsSummary,
  });

  console.log("[askbob-quote-regenerate-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    hasDiagnosisSummary: Boolean(diagnosisSummary?.trim()),
    hasMaterialsSummary: Boolean(materialsSummary?.trim()),
    hasJobTitle: Boolean(job.title?.trim()),
    hasJobDescription: Boolean(job.description_raw?.trim()),
  });

  const taskInput: AskBobQuoteGenerateInput = {
    task: "quote.generate",
    context: {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      customerId: job.customer_id ?? null,
      quoteId: null,
    },
    prompt: QUOTE_REGEN_PROMPT,
    extraDetails: extraDetails ?? null,
    jobTitle: job.title?.trim() ?? null,
  };

  try {
    const taskResult = (await runAskBobTask(supabase, taskInput)) as AskBobQuoteGenerateResult;
    const suggestion = adaptAskBobQuoteToSmartQuote(taskResult);
    const latestVersion = await getLatestJobTaskSnapshotVersion(supabase, {
      workspaceId: workspace.id,
      jobId: job.id,
      task: "quote.generate",
    });
    const createdAt = latestVersion?.created_at ?? new Date().toISOString();
    const versionId = latestVersion?.id ?? `${job.id}-${Date.now()}`;

    console.log("[askbob-quote-regenerate-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      modelLatencyMs: taskResult.modelLatencyMs,
      linesCount: suggestion.scopeLines.length,
      materialsCount: suggestion.materials?.length ?? 0,
    });

    return {
      ok: true,
      jobId: job.id,
      suggestion,
      modelLatencyMs: taskResult.modelLatencyMs,
      versionId,
      createdAt,
      createdAtLabel: formatSnapshotTimestamp(createdAt),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedMessage =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-quote-regenerate-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncatedMessage,
    });
    return {
      ok: false,
      code: "unknown",
      message: "AskBob couldn’t regenerate a quote. Please try again.",
    };
  }
}
