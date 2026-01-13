import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore } from "next/cache";

import HbCard from "@/components/ui/hb-card";
import TrackedLinkButton from "@/components/mobile/TrackedLinkButton";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import { draftAskBobJobFollowupMessageAction } from "@/app/(app)/askbob/followup-message-draft-actions";
import {
  getJobAskBobSnapshotsForJob,
  recordAskBobJobTaskSnapshot,
} from "@/lib/domain/askbob/service";
import { buildFollowupSummaryFromSnapshot } from "@/lib/domain/askbob/summary";
import type {
  AskBobAfterCallSuggestedChannel,
  AskBobAfterCallSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobJobAfterCallResult,
} from "@/lib/domain/askbob/types";

export const dynamic = "force-dynamic";

type FollowUpPageSearchParams = {
  jobId?: string | string[] | undefined;
  workspaceId?: string | string[] | undefined;
  retry?: string | string[] | undefined;
  debug?: string | string[] | undefined;
};

const JOB_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeSearchParam = (value?: string | string[] | null): string | null => {
  if (!value) {
    return null;
  }
  const candidate = Array.isArray(value) ? value[0]?.trim() : value.trim();
  return candidate && candidate.length ? candidate : null;
};

const isValidJobId = (candidate: string | null): candidate is string => {
  return Boolean(candidate && JOB_ID_REGEX.test(candidate));
};

const mapMessageChannel = (
  messageDraftChannel?: string | null,
  followupChannel?: string | null,
): AskBobAfterCallSuggestedChannel => {
  const normalize = (value?: string | null) => {
    const trimmed = value?.trim().toLowerCase() ?? "";
    if (trimmed === "sms") {
      return "sms";
    }
    if (trimmed === "email") {
      return "email";
    }
    if (trimmed === "phone") {
      return "phone";
    }
    return null;
  };
  return (
    normalize(messageDraftChannel) ??
    normalize(followupChannel) ??
    "none"
  );
};

const DEFAULT_FOLLOWUP_SUMMARY = "AskBob prepared a follow-up recommendation.";

type DraftExtractionResult = {
  draftBody: string | null;
  draftSource: string;
};

type PossiblyLegacyAfterCallSnapshot = AskBobAfterCallSnapshotPayload & {
  result?: {
    draftMessageBody?: unknown;
    payload?: {
      draftMessageBody?: unknown;
    };
  };
  payload?: {
    draftMessageBody?: unknown;
  };
};

const extractAfterCallDraft = (
  snapshot?: AskBobAfterCallSnapshotPayload | null,
): DraftExtractionResult => {
  if (!snapshot) {
    return { draftBody: null, draftSource: "afterCallSnapshot.missing" };
  }
  const legacySnapshot = snapshot as PossiblyLegacyAfterCallSnapshot;
  const candidates = [
    { source: "afterCallSnapshot.draftMessageBody", value: legacySnapshot.draftMessageBody },
    { source: "afterCallSnapshot.result.draftMessageBody", value: legacySnapshot.result?.draftMessageBody },
    { source: "afterCallSnapshot.payload.draftMessageBody", value: legacySnapshot.payload?.draftMessageBody },
    {
      source: "afterCallSnapshot.result.payload.draftMessageBody",
      value: legacySnapshot.result?.payload?.draftMessageBody,
    },
  ];

  let firstEmptySource: string | null = null;
  for (const candidate of candidates) {
    if (typeof candidate.value !== "string") {
      continue;
    }
    const trimmed = candidate.value.trim();
    if (trimmed.length) {
      return { draftBody: trimmed, draftSource: candidate.source };
    }
    if (!firstEmptySource) {
      firstEmptySource = candidate.source;
    }
  }

  return {
    draftBody: null,
    draftSource: firstEmptySource ?? "afterCallSnapshot.empty",
  };
};

type EnsureFollowupDraftArgs = {
  supabase: Awaited<ReturnType<typeof createServerClient>>;
  workspaceId: string;
  jobId: string;
  jobTitle?: string | null;
  customerId?: string | null;
  followupSnapshot?: AskBobFollowupSnapshotPayload | null;
  followupSummary?: string | null;
};

type EnsureFollowupDraftResult = {
  attempted: boolean;
  ok: boolean;
  code?: string | null;
  wroteSnapshot: boolean;
  messageLength?: number;
};

async function ensureFollowupDraftIsStored({
  supabase,
  workspaceId,
  jobId,
  jobTitle,
  customerId,
  followupSnapshot,
  followupSummary,
}: EnsureFollowupDraftArgs): Promise<EnsureFollowupDraftResult> {
  if (!customerId) {
    console.warn(
      "[mobile-followup] follow-up draft skipped (missing customer)",
      { jobId, workspaceId },
    );
    return { attempted: false, ok: false, wroteSnapshot: false };
  }
  try {
    const draft = await draftAskBobJobFollowupMessageAction({
      workspaceId,
      jobId,
      jobTitle: jobTitle?.trim() || null,
      extraDetails: followupSummary ?? null,
    });
    const messageBody = draft.body?.trim();
    const result: EnsureFollowupDraftResult = {
      attempted: true,
      ok: Boolean(draft.ok),
      code: draft.code ?? null,
      wroteSnapshot: false,
      messageLength: messageBody?.length,
    };

    if (!draft.ok) {
      console.error("[mobile-followup] follow-up draft action failed", {
        jobId,
        workspaceId,
        code: draft.code,
      });
      return result;
    }

    if (!messageBody) {
      console.warn("[mobile-followup] generated draft body is empty", { jobId, workspaceId });
      return result;
    }

    const followupSteps = followupSnapshot?.steps
      ?.map((step) => step.label?.trim())
      .filter((label): label is string => Boolean(label)) ?? [];
    const afterCallResult: AskBobJobAfterCallResult = {
      afterCallSummary:
        followupSummary ??
        followupSnapshot?.rationale?.trim() ??
        DEFAULT_FOLLOWUP_SUMMARY,
      recommendedActionLabel:
        followupSnapshot?.recommendedAction?.trim() ?? "Send a follow-up message",
      recommendedActionSteps: followupSteps,
      suggestedChannel: mapMessageChannel(draft.meta.suggestedChannel ?? null, followupSnapshot?.suggestedChannel),
      draftMessageBody: messageBody,
      urgencyLevel: "normal",
      notesForTech: draft.meta.summary ?? followupSummary ?? null,
      modelLatencyMs: draft.meta.modelLatencyMs,
    };
    try {
      await recordAskBobJobTaskSnapshot(supabase, {
        workspaceId,
        jobId,
        task: "job.after_call",
        result: afterCallResult,
      });
      result.wroteSnapshot = true;
    } catch (error) {
      console.error(
        "[mobile-followup] failed to store follow-up task snapshot",
        { jobId, workspaceId, error },
      );
    }
    return result;
  } catch (error) {
    console.error("[mobile-followup] failed to store follow-up draft", { jobId, workspaceId, error });
    return { attempted: true, ok: false, wroteSnapshot: false };
  }
}

type PlaceholderProps = {
  jobId: string | null;
  workspaceId: string | null;
  description?: string;
  showRetry?: boolean;
  retryHref?: string;
};

function renderPlaceholder({
  jobId,
  workspaceId,
  description,
  showRetry = false,
  retryHref,
}: PlaceholderProps) {
  const backHref = jobId ? `/m/jobs/${jobId}` : "/m";
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <Link href="/m" className="text-sm font-semibold text-[var(--color-text-secondary)]">
          {mobileFlowCopy.home.title}
        </Link>
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
          {mobileFlowCopy.followupPlaceholder.title}
        </h1>
      </header>
        <HbCard className="space-y-4" data-testid="mobile-followup-placeholder-card">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {description ?? mobileFlowCopy.followupPlaceholder.description}
        </p>
        <TrackedLinkButton
          href={backHref}
          eventName="[followup-placeholder-back-click]"
          eventPayload={{ jobId, workspaceId }}
          variant="secondary"
          size="md"
          className="w-full justify-center"
        >
          {mobileFlowCopy.followupPlaceholder.backButton}
        </TrackedLinkButton>
        {showRetry && retryHref && (
          <TrackedLinkButton
            href={retryHref}
            eventName="[followup-placeholder-retry-click]"
            eventPayload={{ jobId, workspaceId }}
            variant="secondary"
            size="md"
            className="w-full justify-center"
            data-testid="mobile-followup-placeholder-retry-button"
          >
            {mobileFlowCopy.followupPlaceholder.retryButton}
          </TrackedLinkButton>
        )}
      </HbCard>
    </div>
  );
}

type DraftCardProps = {
  jobId: string;
  backHref: string;
  workspaceId: string;
  followupSnapshot?: AskBobFollowupSnapshotPayload | null;
  followupSummary?: string | null;
  draftBody: string;
};

function renderDraftCard({
  jobId,
  backHref,
  workspaceId,
  followupSnapshot,
  followupSummary,
  draftBody,
}: DraftCardProps) {
  const nextSteps = followupSnapshot?.steps ?? [];
  const stepsList =
    nextSteps.length > 0
      ? nextSteps
          .map((step) => step.label?.trim() || null)
          .filter((item): item is string => Boolean(item))
      : [];
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <Link href="/m" className="text-sm font-semibold text-[var(--color-text-secondary)]">
          {mobileFlowCopy.home.title}
        </Link>
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
          {mobileFlowCopy.followupDraft.title}
        </h1>
      </header>
      <HbCard className="space-y-4" data-testid="mobile-followup-draft-card">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {mobileFlowCopy.followupDraft.description}
        </p>
        {followupSummary && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {followupSummary}
          </p>
        )}
        <div className="rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-surface-secondary)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
            {mobileFlowCopy.followupDraft.messageHeading}
          </p>
          <p
            className="mt-2 whitespace-pre-line text-sm text-[var(--color-text-primary)]"
            data-testid="mobile-followup-draft-message"
          >
            {draftBody}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
            {mobileFlowCopy.followupDraft.stepsHeading}
          </p>
          {stepsList.length ? (
            <ul className="mt-2 space-y-2 text-sm text-[var(--color-text-primary)]">
              {stepsList.map((step, index) => (
                <li key={`${step}-${index}`} className="flex gap-2">
                  <span className="text-[var(--color-text-secondary)]">•</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {mobileFlowCopy.followupDraft.stepsFallback}
            </p>
          )}
        </div>
        <TrackedLinkButton
          href={backHref}
          eventName="[followup-draft-back-click]"
          eventPayload={{ jobId, workspaceId }}
          variant="secondary"
          size="md"
          className="w-full justify-center"
        >
          {mobileFlowCopy.followupDraft.backButton}
        </TrackedLinkButton>
      </HbCard>
    </div>
  );
}

export default async function MobileFollowUpDraftPage({
  searchParams,
}: {
  searchParams?: Promise<FollowUpPageSearchParams>;
}) {
  unstable_noStore();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const retryParam = normalizeSearchParam(resolvedSearchParams.retry);
  const debugParam = normalizeSearchParam(resolvedSearchParams.debug);
  const shouldDebugFollowup =
    process.env.HB_DEBUG_FOLLOWUP === "1" || debugParam === "1";
  const shouldForceRetry = retryParam === "1";

  const rawJobId = normalizeSearchParam(resolvedSearchParams.jobId);
  const rawWorkspaceId = normalizeSearchParam(resolvedSearchParams.workspaceId);
  const jobId = isValidJobId(rawJobId) ? rawJobId : null;
  const workspaceId = rawWorkspaceId;

  const status = {
    jobFound: false,
    workspaceMatch: false,
    hasFollowupSnapshot: false,
    shouldSendMessage: false,
    hadAfterCallDraft: false,
    attemptedDraftGenerate: false,
    draftActionOk: false,
    draftActionCode: null as string | null,
    wroteSnapshotOk: false,
    reloadedDraftPresent: false,
    draftSource: "unknown",
  };

  let hasFollowupSnapshot = false;
  let shouldSendMessage = false;
  let latestDraftBody: string | null = null;
  let latestDraftSource = "afterCallSnapshot.missing";
  let renderDecisionLogged = false;

  const logStatus = () => {
    if (shouldDebugFollowup) {
      console.log("[mobile-followup-debug]", status);
    }
  };

  const logRenderDecision = (variant: "draft" | "placeholder") => {
    if (!shouldDebugFollowup || renderDecisionLogged) {
      return;
    }
    console.log("[mobile-followup-render]", {
      jobId,
      workspaceId,
      variant,
      draftPresent: Boolean(latestDraftBody),
      draftSource: latestDraftSource,
      shouldSendMessage,
      hasFollowupSnapshot,
      retryParam,
    });
    renderDecisionLogged = true;
  };

  const logAndRenderPlaceholder = (props: PlaceholderProps) => {
    logRenderDecision("placeholder");
    logStatus();
    return renderPlaceholder(props);
  };
  const logAndRenderDraftCard = (props: DraftCardProps) => {
    logRenderDecision("draft");
    logStatus();
    return renderDraftCard(props);
  };

  if (!jobId || !workspaceId) {
    return logAndRenderPlaceholder({ jobId, workspaceId });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logStatus();
    redirect("/");
  }

  const workspaceResult = await getCurrentWorkspace({ supabase });
  if (!workspaceResult.workspace || workspaceResult.workspace.id !== workspaceId) {
    logStatus();
    redirect("/m");
  }
  status.workspaceMatch = true;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, workspace_id, title, customer_id")
    .eq("workspace_id", workspaceId)
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    console.error("[mobile-followup] job lookup failed", {
      jobId,
      workspaceId,
      jobError,
    });
    return logAndRenderPlaceholder({ jobId, workspaceId });
  }
  status.jobFound = true;

  let snapshots: Awaited<ReturnType<typeof getJobAskBobSnapshotsForJob>> | null = null;
  try {
    snapshots = await getJobAskBobSnapshotsForJob(supabase, {
      workspaceId: job.workspace_id,
      jobId: job.id,
    });
  } catch (error) {
    console.error("[mobile-followup] failed to load AskBob snapshots", error);
    return logAndRenderPlaceholder({ jobId: job.id, workspaceId: job.workspace_id });
  }

  if (!snapshots) {
    return logAndRenderPlaceholder({ jobId: job.id, workspaceId: job.workspace_id });
  }

  const followupSummary = buildFollowupSummaryFromSnapshot(snapshots.followupSnapshot);
  hasFollowupSnapshot = Boolean(snapshots.followupSnapshot);
  shouldSendMessage =
    hasFollowupSnapshot && Boolean(snapshots.followupSnapshot?.shouldSendMessage);
  status.hasFollowupSnapshot = hasFollowupSnapshot;
  status.shouldSendMessage = shouldSendMessage;

  const initialDraft = extractAfterCallDraft(snapshots.afterCallSnapshot);
  let draftBody = initialDraft.draftBody;
  latestDraftBody = draftBody;
  latestDraftSource = initialDraft.draftSource;
  status.hadAfterCallDraft = Boolean(draftBody);
  status.draftSource = initialDraft.draftSource;

  let attemptResult: EnsureFollowupDraftResult = {
    attempted: false,
    ok: false,
    wroteSnapshot: false,
  };

  if (shouldSendMessage && !draftBody && (!attemptResult.attempted || shouldForceRetry)) {
    attemptResult = await ensureFollowupDraftIsStored({
      supabase,
      workspaceId: job.workspace_id,
      jobId: job.id,
      jobTitle: job.title ?? null,
      customerId: job.customer_id ?? null,
      followupSnapshot: snapshots.followupSnapshot,
      followupSummary,
    });
    status.attemptedDraftGenerate = attemptResult.attempted;
    status.draftActionOk = attemptResult.ok;
    status.draftActionCode = attemptResult.code ?? null;
    status.wroteSnapshotOk = attemptResult.wroteSnapshot;
    try {
      snapshots = await getJobAskBobSnapshotsForJob(supabase, {
        workspaceId: job.workspace_id,
        jobId: job.id,
      });
      const reloadedDraft = extractAfterCallDraft(snapshots.afterCallSnapshot);
      draftBody = reloadedDraft.draftBody;
      latestDraftBody = draftBody;
      latestDraftSource = reloadedDraft.draftSource;
      status.draftSource = reloadedDraft.draftSource;
    } catch (error) {
      console.error("[mobile-followup] failed to reload AskBob snapshots", error);
    }
  }

  status.reloadedDraftPresent = Boolean(draftBody);

  const shouldShowRetryAffordance =
    shouldSendMessage &&
    status.attemptedDraftGenerate &&
    (!status.draftActionOk || !status.wroteSnapshotOk || !status.reloadedDraftPresent);

  const placeholderDescription = shouldShowRetryAffordance
    ? mobileFlowCopy.followupPlaceholder.retryDescription
    : undefined;

  const retryHref =
    shouldShowRetryAffordance &&
    job &&
    (() => {
      const params = new URLSearchParams({
        jobId: job.id,
        workspaceId: job.workspace_id,
      });
      if (debugParam) {
        params.set("debug", debugParam);
      }
      params.set("retry", "1");
      return `/m/follow-up?${params.toString()}`;
    })();

  const finalDraftReady = Boolean(draftBody);
  const variant: "draft" | "placeholder" = finalDraftReady ? "draft" : "placeholder";
  if (variant === "draft") {
    const backHref = `/m/jobs/${job.id}`;
    // Invariant: once the draft branch runs, placeholder must not be rendered.
    return logAndRenderDraftCard({
      jobId: job.id,
      workspaceId: job.workspace_id,
      backHref,
      followupSnapshot: snapshots.followupSnapshot,
      followupSummary,
      draftBody,
    });
  }

  // Invariant: the placeholder branch is only reachable when variant !== "draft".
  return logAndRenderPlaceholder({
    jobId: job.id,
    workspaceId: job.workspace_id,
    description: placeholderDescription,
    showRetry: shouldShowRetryAffordance,
    retryHref,
  });
}
