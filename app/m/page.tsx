import { redirect } from "next/navigation";
import { unstable_noStore } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import { ReassuranceAvatarIcon } from "@/components/ui/icons";
import TrackedLinkButton from "@/components/mobile/TrackedLinkButton";
import MobileHomeSubmitCtaButton from "@/app/m/components/MobileHomeSubmitCtaButton";
import { runInternalScenarioAction } from "@/app/m/actions/runInternalScenarioAction";
import {
  deriveHomeInstruction,
  type HomeInstructionCandidate,
} from "@/lib/domain/askbob/homeInstruction";
import { buildHomeInstructionTelemetryPayload } from "./homeInstructionTelemetry";
import { homeInstructionFirstCopy } from "@/lib/domain/mobile/homeInstructionCopy";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import type {
  AskBobAfterCallSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobJobTaskSnapshotTask,
} from "@/lib/domain/askbob/types";
import { resolveHomePrimaryCardPayload } from "@/lib/domain/bobflow/resolveHomePrimaryCardPayload";
import {
  deriveNextScenarioFromFollowupSnapshot,
  type DerivedFollowupScenario,
} from "@/lib/domain/bobflow/deriveNextScenarioFromFollowupSnapshot";
import { resolveBobFlowScenario } from "@/lib/domain/bobflow/resolveBobFlowScenario";
import { resolveNextInternalScenario } from "@/lib/domain/bobflow/resolveNextInternalScenario";
import {
  bobFlowScenarioList,
  isInternalScenario,
  type BobFlowScenario,
} from "@/lib/domain/bobflow/bobFlowScenario";
import {
  getHomePrimaryCardHandoffCopy,
  INTERNAL_HANDOFF_SUBCOPY,
  COMPLETION_HANDOFF_SUBCOPY,
} from "@/lib/domain/bobflow/homePrimaryCardCopy";

type CustomerRecord = { name: string | null };

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  customer?: CustomerRecord | CustomerRecord[] | null;
};

const resolveCustomerRecord = (
  customer?: CustomerRecord | CustomerRecord[] | null,
): CustomerRecord | null => {
  if (!customer) {
    return null;
  }
  if (Array.isArray(customer)) {
    return customer[0] ?? null;
  }
  return customer;
};

const getCustomerNameFromRecord = (customer?: CustomerRecord | CustomerRecord[] | null): string | null => {
  const record = resolveCustomerRecord(customer);
  const trimmed = record?.name?.trim();
  return trimmed ? trimmed : null;
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
  "job.after_call",
];

type MobileHomePageSearchParams = Record<string, string | string[] | undefined>;

type MobileHomePageProps = {
  searchParams?: MobileHomePageSearchParams | Promise<MobileHomePageSearchParams>;
};

const normalizeSearchParam = (value?: string | string[] | undefined): string | null => {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0]?.trim() || null : value.trim() || null;
};

type JobArtifactState = {
  hasDiagnoseSnapshot: boolean;
  hasMaterialsSnapshot: boolean;
  followupSnapshot: AskBobFollowupSnapshotPayload | null;
  hasFollowupDraftReady: boolean;
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

export default async function MobileHomePage({ searchParams }: MobileHomePageProps = {}) {
  unstable_noStore();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const handoffParam = normalizeSearchParam(resolvedSearchParams?.handoff);
  const handoffJobIdParam = normalizeSearchParam(resolvedSearchParams?.jobId);
  const handoffScenarioParam = normalizeSearchParam(resolvedSearchParams?.scenario);
  const handoffExecutedParam = normalizeSearchParam(resolvedSearchParams?.executed);
  const handoffCompletedParam = normalizeSearchParam(resolvedSearchParams?.completed);
  const shouldShowHandoffSignal = handoffParam === "1" && handoffExecutedParam === "1";
  const handoffScenarioFromParams =
    handoffScenarioParam && bobFlowScenarioList.includes(handoffScenarioParam as BobFlowScenario)
      ? (handoffScenarioParam as BobFlowScenario)
      : null;
  const handoffScenarioIsValid = Boolean(handoffScenarioFromParams);
  const handoffCompleted = handoffCompletedParam === "1";
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
    .select("id, title, status, created_at, updated_at, customer:customers!inner(name)")
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
  const snapshotsByJob = new Map<string, SnapshotRow[]>();

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
        const jobSnapshots = snapshotsByJob.get(row.job_id) ?? [];
        jobSnapshots.push(row);
        snapshotsByJob.set(row.job_id, jobSnapshots);
        let state = artifactStates.get(row.job_id);
        if (!state) {
          state = {
            hasDiagnoseSnapshot: false,
            hasMaterialsSnapshot: false,
            followupSnapshot: null,
            hasFollowupDraftReady: false,
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
        if (row.task === "job.after_call" && row.payload && typeof row.payload === "object") {
          const payload = row.payload as AskBobAfterCallSnapshotPayload;
          const draftBody =
            typeof payload.draftMessageBody === "string" ? payload.draftMessageBody.trim() : "";
          if (draftBody) {
            state.hasFollowupDraftReady = true;
          }
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
      const customerName = getCustomerNameFromRecord(job.customer);
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
    followUpDraftReady: artifact?.hasFollowupDraftReady ?? false,
    hasCallWithMissingOutcome: false,
    latestCallOutcomeRecorded: false,
      invoicePresent: false,
      invoiceStatus: null,
      customerName,
    };
  });

  const homeInstruction = deriveHomeInstruction(candidates);
  const actionableInstruction =
    homeInstruction &&
    homeInstruction.instruction.primaryCta &&
    !homeInstruction.instruction.primaryCta.disabled
      ? homeInstruction
      : null;
  const actionablePrimaryCta = actionableInstruction?.instruction.primaryCta;
  const hasRecommendation = Boolean(actionablePrimaryCta && !actionablePrimaryCta.disabled);
  const renderTelemetry = buildHomeInstructionTelemetryPayload(
    actionableInstruction?.instruction ?? null,
    hasRecommendation,
  );
  const instructionCopy = actionableInstruction?.instructionCopy;
  const hasFollowupDraftReadyCopy =
    instructionCopy === homeInstructionFirstCopy.followup_draft_ready;
  const actionableJobId = actionableInstruction?.jobId ?? null;
  const jobSnapshots = actionableJobId ? snapshotsByJob.get(actionableJobId) ?? [] : [];
  const baseScenario = resolveBobFlowScenario({
    homeInstruction: actionableInstruction,
    hasRecommendation,
  });
  const derivedSnapshotScenario: DerivedFollowupScenario | null =
    actionableInstruction && actionableInstruction.followupSnapshot
      ? deriveNextScenarioFromFollowupSnapshot(actionableInstruction.followupSnapshot)
      : null;
  const followupSnapshotDriven = derivedSnapshotScenario !== null;
  const derivedScenarioForHandoff =
    derivedSnapshotScenario && derivedSnapshotScenario !== "Idle"
      ? derivedSnapshotScenario
      : null;
  const nextInternalScenario = actionableInstruction
    ? resolveNextInternalScenario(jobSnapshots)
    : null;
  const scenario =
    nextInternalScenario ?? derivedScenarioForHandoff ?? baseScenario;
  const primaryJobId = actionableInstruction?.jobId?.trim() ?? null;
  const jobMatchesHandoff =
    Boolean(handoffJobIdParam && primaryJobId && handoffJobIdParam === primaryJobId);
  const handoffCopyScenario =
    derivedScenarioForHandoff && handoffScenarioFromParams === derivedScenarioForHandoff
      ? derivedScenarioForHandoff
      : null;
  const shouldShowInternalHandoffCopy =
    shouldShowHandoffSignal &&
    jobMatchesHandoff &&
    handoffScenarioIsValid &&
    isInternalScenario(scenario);
  const shouldShowDerivedHandoffCopy =
    shouldShowHandoffSignal &&
    jobMatchesHandoff &&
    handoffScenarioIsValid &&
    Boolean(handoffCopyScenario) &&
    scenario === handoffCopyScenario;
  const shouldShowCompletionCopy =
    handoffCompleted &&
    jobMatchesHandoff &&
    Boolean(derivedScenarioForHandoff) &&
    !nextInternalScenario &&
    scenario === derivedScenarioForHandoff;
  const canRenderPrimaryCard = Boolean(actionableInstruction) && scenario !== "Idle";
  let primaryCardPayload =
    canRenderPrimaryCard && actionableInstruction
      ? resolveHomePrimaryCardPayload({
          scenario,
          jobId: actionableInstruction.jobId ?? null,
          jobTitle: actionableInstruction.title ?? null,
          workspaceId: workspace?.id ?? null,
          isFollowupDraftReady: Boolean(hasFollowupDraftReadyCopy),
          fallbackHref: actionablePrimaryCta?.href ?? null,
          telemetryPayload: renderTelemetry,
          customerName: actionableInstruction.customerName ?? null,
          followupSnapshotDriven,
        })
      : null;
  const shouldShowPrimaryCard = Boolean(primaryCardPayload);

  if (shouldShowInternalHandoffCopy && primaryCardPayload) {
    primaryCardPayload = {
      ...primaryCardPayload,
      subcopy: INTERNAL_HANDOFF_SUBCOPY,
    };
  }
  if (shouldShowDerivedHandoffCopy && primaryCardPayload && handoffCopyScenario) {
    primaryCardPayload = {
      ...primaryCardPayload,
      subcopy: getHomePrimaryCardHandoffCopy(handoffCopyScenario),
    };
  }
  if (shouldShowCompletionCopy && primaryCardPayload) {
    primaryCardPayload = {
      ...primaryCardPayload,
      subcopy: COMPLETION_HANDOFF_SUBCOPY,
    };
  }
  const primaryCtaTelemetryPayload = primaryCardPayload?.telemetryPayload ?? {};
  const primaryCtaPayloadString =
    JSON.stringify(primaryCtaTelemetryPayload ?? {}) ?? "{}";
  const isMoveOnPrimaryCta = primaryCardPayload?.ctaIntent === "move_on";
  const actionJobId = actionableJobId ?? "";
  const actionWorkspaceId = workspace?.id ?? "";

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
  const isIdle = !hasRecommendation;
  const reassuranceCopy = mobileFlowCopy.home.idleReassurance;
  const shouldShowReassuranceCard = Boolean(reassuranceCopy && (isIdle || hasRecommendation));
  const renderReassuranceCard = () => (
    <HbCard
      data-testid="mobile-home-reassurance-card"
      className="space-y-0 mobile-home-reassurance-card"
    >
      <div className="flex items-start gap-3 mobile-home-reassurance-content">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-background-paper)] mobile-home-reassurance-avatar">
          <ReassuranceAvatarIcon
            className="h-8 w-8 text-[var(--color-primary)] mobile-home-reassurance-icon"
            aria-hidden
          />
        </div>
        <p className="text-sm font-normal leading-relaxed text-[var(--color-text-secondary)] mobile-home-reassurance-text">
          {reassuranceCopy}
        </p>
      </div>
    </HbCard>
  );

  return (
    <div className="flex flex-col mobile-home">
      <header data-testid="mobile-home-header" className="space-y-1 mobile-home-header">
        <h1
          className="text-3xl font-semibold text-[var(--color-text-primary)] mobile-home-title"
        >
          {mobileFlowCopy.home.title}
        </h1>
        <p
          className="text-sm font-light leading-relaxed text-[var(--color-text-secondary)] mobile-home-greeting"
        >
          {greeting}
        </p>
      </header>

      <div className="flex flex-col mobile-home-stack">
        {shouldShowPrimaryCard && primaryCardPayload && (
          <HbCard
            data-testid="mobile-home-recommendation-card"
            className="mobile-home-primary-card"
          >
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                {primaryCardPayload.title}
              </h2>
              {primaryCardPayload.customerLine && (
                <p
                  data-testid="mobile-home-primary-customer"
                  className="text-sm text-[var(--color-text-secondary)]"
                >
                  {primaryCardPayload.customerLine}
                </p>
              )}
              {primaryCardPayload.subcopy && (
                <p className="mobile-home-instruction-subcopy">
                  {primaryCardPayload.subcopy}
                </p>
              )}
            </div>
            {primaryCardPayload?.ctaLabel && (
              isMoveOnPrimaryCta && shouldShowPrimaryCard ? (
                <form
                  action={runInternalScenarioAction}
                  className="space-y-0"
                  data-testid="mobile-home-primary-cta-form"
                >
                  <input type="hidden" name="scenario" value={scenario} />
                  <input type="hidden" name="jobId" value={actionJobId} />
                  <input type="hidden" name="workspaceId" value={actionWorkspaceId} />
                  <input type="hidden" name="intent" value="move_on" />
                  <MobileHomeSubmitCtaButton
                    label={primaryCardPayload.ctaLabel}
                    dataTestId="mobile-home-primary-cta"
                    eventName="[home-recommendation-click]"
                    eventPayloadJson={primaryCtaPayloadString}
                  />
                </form>
              ) : primaryCardPayload.href ? (
                <TrackedLinkButton
                  href={primaryCardPayload.href}
                  eventName="[home-recommendation-click]"
                  eventPayload={primaryCardPayload.telemetryPayload}
                  variant="primary"
                  size="md"
                  className="hb-mobile-primary-cta justify-center"
                  data-testid="mobile-home-primary-cta"
                >
                  {primaryCardPayload.ctaLabel}
                </TrackedLinkButton>
              ) : null
            )}
          </HbCard>
        )}

        {shouldShowReassuranceCard && renderReassuranceCard()}
      </div>
    </div>
  );
}
