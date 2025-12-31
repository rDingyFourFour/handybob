import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import TrackedLinkButton from "@/components/mobile/TrackedLinkButton";
import {
  deriveHomeInstruction,
  type HomeInstructionCandidate,
} from "@/lib/domain/askbob/homeInstruction";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import type { AskBobFollowupSnapshotPayload, AskBobJobTaskSnapshotTask } from "@/lib/domain/askbob/types";

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type JobQuoteRow = {
  id: string;
  job_id: string;
  status: string | null;
  created_at: string | null;
};

type SnapshotRow = {
  job_id: string | null;
  task: AskBobJobTaskSnapshotTask | null;
  payload: unknown;
  updated_at: string | null;
};

const SNAPSHOT_TASKS: AskBobJobTaskSnapshotTask[] = [
  "job.diagnose",
  "materials.generate",
  "quote.generate",
  "job.followup",
];

type JobArtifactState = {
  hasDiagnoseSnapshot: boolean;
  hasMaterialsSnapshot: boolean;
  followupSnapshot: AskBobFollowupSnapshotPayload | null;
  lastActivityAt: string | null;
};

const updateMostRecent = (current: string | null, candidate: string | null): string | null => {
  if (!candidate) return current;
  if (!current) return candidate;
  const currentTime = Date.parse(current);
  const candidateTime = Date.parse(candidate);
  if (Number.isNaN(candidateTime)) return current;
  if (Number.isNaN(currentTime)) return candidate;
  return candidateTime > currentTime ? candidate : current;
};

export default async function MobileHomePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  const workspaceResult = await getCurrentWorkspace({ supabase });
  const workspace = workspaceResult.workspace;
  if (!workspace) {
    redirect("/");
  }

  const jobsResponse = await supabase
    .from<JobRow>("jobs")
    .select("id, title, status, created_at, updated_at")
    .eq("workspace_id", workspace.id)
    .order("updated_at", { ascending: false, nulls: "last" })
    .limit(25);
  const jobRows = jobsResponse.data ?? [];
  if (jobsResponse.error) {
    console.error("[mobile-home] Failed to load jobs for recommendation", jobsResponse.error);
  }

  const jobIds = jobRows.map((job) => job.id);
  const artifactStates = new Map<string, JobArtifactState>();
  const quoteMap = new Map<string, JobQuoteRow>();

  if (jobIds.length > 0) {
    const snapshotResponse = await supabase
      .from<SnapshotRow>("askbob_job_task_snapshots")
      .select("job_id, task, payload, updated_at")
      .eq("workspace_id", workspace.id)
      .in("job_id", jobIds)
      .in("task", SNAPSHOT_TASKS)
      .order("updated_at", { ascending: false });

    if (snapshotResponse.error) {
      console.error("[mobile-home] Failed to load AskBob snapshots", snapshotResponse.error);
    } else {
      for (const row of snapshotResponse.data ?? []) {
        if (!row?.job_id || !row.task) {
          continue;
        }
        let state = artifactStates.get(row.job_id);
        if (!state) {
          state = {
            hasDiagnoseSnapshot: false,
            hasMaterialsSnapshot: false,
            followupSnapshot: null,
            lastActivityAt: null,
          };
          artifactStates.set(row.job_id, state);
        }
        state.lastActivityAt = updateMostRecent(state.lastActivityAt, row.updated_at);
        if (row.task === "job.diagnose") {
          state.hasDiagnoseSnapshot = true;
        }
        if (row.task === "materials.generate") {
          state.hasMaterialsSnapshot = true;
        }
        if (row.task === "job.followup" && row.payload && typeof row.payload === "object") {
          state.followupSnapshot = row.payload as AskBobFollowupSnapshotPayload;
        }
        if (!state.lastActivityAt && row.updated_at) {
          state.lastActivityAt = row.updated_at;
        }
      }
    }

    const quotesResponse = await supabase
      .from<JobQuoteRow>("quotes")
      .select("id, job_id, status, created_at")
      .eq("workspace_id", workspace.id)
      .in("job_id", jobIds)
      .order("created_at", { ascending: false });

    if (quotesResponse.error) {
      console.error("[mobile-home] Failed to load quotes for recommendation", quotesResponse.error);
    } else {
      for (const quote of quotesResponse.data ?? []) {
        if (!quote.job_id || quoteMap.has(quote.job_id)) {
          continue;
        }
        quoteMap.set(quote.job_id, quote);
      }
    }
  }

  const candidates: HomeInstructionCandidate[] = jobRows.map((job) => {
    const artifact = artifactStates.get(job.id);
    const latestQuote = quoteMap.get(job.id);
    return {
      jobId: job.id,
      title: job.title,
      status: job.status,
      updatedAt: job.updated_at,
      createdAt: job.created_at,
      lastActivityAt: artifact?.lastActivityAt ?? job.updated_at,
      hasDiagnoseSnapshot: artifact?.hasDiagnoseSnapshot ?? false,
      hasMaterialsSnapshot: artifact?.hasMaterialsSnapshot ?? false,
      latestQuoteId: latestQuote?.id ?? null,
      latestQuoteStatus: latestQuote?.status ?? null,
      followupSnapshot: artifact?.followupSnapshot ?? null,
      callRecommended: Boolean(artifact?.followupSnapshot?.callRecommended),
      hasCallWithMissingOutcome: false,
      latestCallOutcomeRecorded: false,
      invoicePresent: false,
      invoiceStatus: null,
    };
  });

  const homeInstruction = deriveHomeInstruction(candidates);
  const hasPrimaryCta =
    Boolean(homeInstruction?.instruction.primaryCta) &&
    !homeInstruction?.instruction.primaryCta?.disabled;
  const hasRecommendation = Boolean(homeInstruction && hasPrimaryCta);
  const fallbackTelemetry = {
    stepType: "idle",
    hasPrimaryCta: false,
    isIdle: true,
  };
  const instructionTelemetry = homeInstruction?.instruction.telemetry ?? fallbackTelemetry;
  console.log("[home-render]", {
    isMobile: true,
    hasRecommendation,
    instructionStepType: instructionTelemetry.stepType,
    instructionTelemetry,
  });

  const metadata = user.user_metadata as { full_name?: string; name?: string } | undefined;
  const displayName = (
    metadata?.full_name ??
    metadata?.name ??
    user.email ??
    user.id ??
    ""
  ).trim();
  const greeting = displayName
    ? mobileFlowCopy.home.greetingTemplate.replace("{name}", displayName)
    : mobileFlowCopy.home.greetingFallback;

  return (
    <div className="space-y-6 pb-8">
      <header data-testid="mobile-home-header" className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
          {mobileFlowCopy.home.title}
        </p>
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
          {mobileFlowCopy.home.title}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{greeting}</p>
      </header>

      {homeInstruction ? (
        <HbCard data-testid="mobile-home-recommendation-card" className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
              {mobileFlowCopy.home.recommendationLabel}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">{mobileFlowCopy.home.statement}</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              {homeInstruction.title ?? mobileFlowCopy.home.recommendationTitleFallback}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {homeInstruction.instruction.recommendation}
            </p>
            {homeInstruction.instruction.rationale ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {homeInstruction.instruction.rationale}
              </p>
            ) : null}
          </div>
          {homeInstruction.instruction.primaryCta && (
            <TrackedLinkButton
              href={homeInstruction.instruction.primaryCta.href ?? "#"}
              eventName="[home-recommendation-click]"
              eventPayload={{
                jobId: homeInstruction.jobId,
                instructionStepType: homeInstruction.instruction.stepType,
                instructionTelemetry: homeInstruction.instruction.telemetry,
                actionType: homeInstruction.instruction.primaryCta.actionType,
                destination: homeInstruction.instruction.primaryCta.href ?? null,
                hasPrimaryCta,
                nextStepType: homeInstruction.instruction.telemetry.nextStepType ?? null,
              }}
              variant="primary"
              size="md"
              className="w-full justify-center"
              data-testid="mobile-home-primary-cta"
            >
              {homeInstruction.instruction.primaryCta.label}
            </TrackedLinkButton>
          )}
        </HbCard>
      ) : (
        <HbCard data-testid="mobile-home-idle-card">
          <p className="text-sm text-[var(--color-text-secondary)]">{mobileFlowCopy.home.idleReassurance}</p>
        </HbCard>
      )}
    </div>
  );
}
