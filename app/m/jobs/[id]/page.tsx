import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import TrackedLinkButton from "@/components/mobile/TrackedLinkButton";
import { buildJobBriefDisplayModel } from "@/lib/domain/askbob/jobDetailsDerivedCopy";
import { deriveNextStepForJobDetails, type NextStepType } from "@/lib/domain/askbob/nextStep";
import { PROGRESS_STEP_ANCHORS, type JobProgressStep } from "@/lib/domain/askbob/progressSteps";
import { getJobAskBobSnapshotsForJob } from "@/lib/domain/askbob/service";
import { loadCallHistoryForJob } from "@/lib/domain/askbob/callHistory";
import { getLatestCallOutcomeForJob } from "@/lib/domain/calls/latestCallOutcome";
import { getInvoiceForJob } from "@/lib/domain/invoices/getInvoiceForJob";
import { deriveMobileActiveJobInstruction } from "@/lib/domain/mobile/activeJobInstruction";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null }[]
    | { id: string | null; name: string | null }
    | null
    | undefined;
};

type JobQuoteRow = {
  id: string;
  status: string | null;
};

type PrimaryAction = {
  href: string | null;
  destinationType: string | null;
};

const JOB_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeJobId(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isValidJobId(candidate: string | null): candidate is string {
  return Boolean(candidate && JOB_ID_REGEX.test(candidate));
}

function resolvePrimaryAction(stepType: NextStepType, jobId: string): PrimaryAction {
  if (stepType === "followup") {
    return {
      href: `/m/follow-up?jobId=${jobId}`,
      destinationType: "followup",
    };
  }
  if (stepType === "call") {
    return {
      href: `/calls/new?jobId=${jobId}`,
      destinationType: "call",
    };
  }
  if (stepType === "invoice") {
    return {
      href: `/jobs/${jobId}#invoice-section`,
      destinationType: "job-details",
    };
  }
  const anchor = PROGRESS_STEP_ANCHORS[stepType as JobProgressStep];
  if (anchor) {
    return {
      href: `/jobs/${jobId}#${anchor}`,
      destinationType: "job-details",
    };
  }
  return {
    href: `/jobs/${jobId}`,
    destinationType: "job-details",
  };
}

export default async function MobileActiveJobPage({
  params,
}: {
  params: Promise<{ id?: string | undefined }>;
}) {
  const { id: rawId } = await params;
  const normalizedJobId = normalizeJobId(rawId);

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

  if (!isValidJobId(normalizedJobId)) {
    return renderJobNotFoundState();
  }

  const jobId = normalizedJobId;

  const { data: jobData, error: jobError } = await supabase
    .from<JobRow>("jobs")
    .select("id, title, status, customer_id, customers(id, name)")
    .eq("workspace_id", workspace.id)
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    const jobErrorRecord = jobError as Record<string, unknown> | undefined;
    const errorCode =
      typeof jobErrorRecord?.code === "string" ? jobErrorRecord.code : "unknown";
    const errorMessage =
      typeof jobErrorRecord?.message === "string" ? jobErrorRecord.message : "Job lookup failed";
    console.error("[mobile-active-job] Job lookup failed", {
      code: errorCode,
      message: errorMessage,
    });
    return renderJobNotFoundState();
  }

  if (!jobData) {
    return renderJobNotFoundState();
  }

  const customer =
    Array.isArray(jobData.customers) && jobData.customers.length > 0
      ? jobData.customers[0]
      : jobData.customers ?? null;
  const customerName = customer?.name ?? null;

  let diagnoseSnapshot = null;
  let materialsSnapshot = null;
  let followupSnapshot = null;
  let afterCallSnapshot = null;
  try {
    const snapshots = await getJobAskBobSnapshotsForJob(supabase, {
      workspaceId: workspace.id,
      jobId: jobData.id,
    });
    diagnoseSnapshot = snapshots.diagnoseSnapshot;
    materialsSnapshot = snapshots.materialsSnapshot;
    followupSnapshot = snapshots.followupSnapshot;
    afterCallSnapshot = snapshots.afterCallSnapshot;
  } catch (error) {
    console.error("[mobile-active-job] Failed to load AskBob snapshots", error);
  }

  const { data: quotes } = await supabase
    .from<JobQuoteRow>("quotes")
    .select("id, status")
    .eq("workspace_id", workspace.id)
    .eq("job_id", jobData.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const latestQuote = quotes?.[0] ?? null;

  let callHistory = [];
  let hasCallWithMissingOutcome = false;
  try {
    callHistory = await loadCallHistoryForJob(supabase, workspace.id, jobData.id, { limit: 25 });
    hasCallWithMissingOutcome = callHistory.some(
      (record) => !(record.outcome ?? record.status ?? "").trim(),
    );
  } catch (error) {
    console.error("[mobile-active-job] Failed to load call history", error);
  }

  let latestCallOutcome = null;
  try {
    latestCallOutcome = await getLatestCallOutcomeForJob(supabase, workspace.id, jobData.id);
  } catch (error) {
    console.error("[mobile-active-job] Failed to load latest call outcome", error);
  }

  let invoice = null;
  try {
    ({ invoice } = await getInvoiceForJob({
      supabase,
      workspaceId: workspace.id,
      jobId: jobData.id,
    }));
  } catch (error) {
    console.error("[mobile-active-job] Failed to load invoice", error);
  }

  const hasDiagnoseSnapshot = Boolean(diagnoseSnapshot);
  const hasMaterialsSnapshot = Boolean(materialsSnapshot);
  const latestQuoteStatus = latestQuote?.status ?? null;
  const latestQuoteId = latestQuote?.id ?? null;
  const callRecommended = Boolean(followupSnapshot?.callRecommended);
  const latestCallOutcomeRecorded = Boolean(latestCallOutcome);
  const invoicePresent = Boolean(invoice);
  const invoiceStatus = invoice?.invoice_status ?? null;
  const followUpDraftReady = Boolean(afterCallSnapshot?.draftMessageBody?.trim());

  const nextStep = deriveNextStepForJobDetails({
    hasDiagnoseSnapshot,
    hasMaterialsSnapshot,
    latestQuoteStatus,
    latestQuoteId,
    followupSnapshot,
    callRecommended,
    hasCallWithMissingOutcome,
    latestCallOutcomeRecorded,
    invoiceStatus,
    invoicePresent,
    followUpDraftReady,
  });

  const jobBrief = buildJobBriefDisplayModel({
    jobTitle: jobData.title ?? "Untitled job",
    customerName,
    nextStep,
    progressRowStatuses: nextStep.statusHints,
  });

  const activeJobInstruction = deriveMobileActiveJobInstruction({
    jobId: jobData.id,
    nextStep,
    jobStatus: jobData.status,
  });

  const primaryAction = nextStep.primaryCta
    ? resolvePrimaryAction(nextStep.stepType, jobData.id)
    : { href: null, destinationType: null };

  console.log("[active-job-render]", {
    jobId: jobData.id,
    nextStepType: nextStep.stepType,
  });

  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-1">
        <Link
          href="/m"
          className="text-sm font-semibold text-[var(--color-text-secondary)]"
        >
          {mobileFlowCopy.home.title}
        </Link>
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
          {jobBrief.jobTitle}
        </h1>
        {jobBrief.customerLine && (
          <p className="text-sm text-[var(--color-text-secondary)]">{jobBrief.customerLine}</p>
        )}
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
          {jobBrief.stateLine}
        </p>
      </header>

      <section>
        <HbCard data-testid="mobile-active-job-next-step-card" className="space-y-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
              {mobileFlowCopy.activeJob.nextStepHeading}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {mobileFlowCopy.activeJob.nextStepHelper}
            </p>
          </div>
          {activeJobInstruction.statement && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              {activeJobInstruction.statement}
            </p>
          )}
          <p className="text-lg text-[var(--color-text-primary)]">
            {activeJobInstruction.recommendation}
          </p>
          {primaryAction.href && activeJobInstruction.primaryCta ? (
            <TrackedLinkButton
              href={primaryAction.href}
              eventName="[active-job-primary-cta-click]"
              eventPayload={{
                jobId: jobData.id,
                nextStepType: nextStep.stepType,
                destinationType: primaryAction.destinationType,
                instructionStepType: activeJobInstruction.telemetry.stepType,
                instructionHasPrimaryCta: activeJobInstruction.telemetry.hasPrimaryCta,
                instructionIsIdle: activeJobInstruction.telemetry.isIdle,
                instructionIsMobile: activeJobInstruction.telemetry.isMobile,
                instructionPrimaryCtaLabel: activeJobInstruction.primaryCta?.label,
                instructionReasonCode: activeJobInstruction.telemetry.reasonCode,
                instructionNextStepType: activeJobInstruction.telemetry.nextStepType,
              }}
              variant="primary"
              size="md"
              className="w-full justify-center"
              data-testid="mobile-active-job-primary-cta"
            >
              {activeJobInstruction.primaryCta.label}
            </TrackedLinkButton>
          ) : null}
          <TrackedLinkButton
            href={`/jobs/${jobData.id}`}
            eventName="[active-job-view-details-click]"
            eventPayload={{ jobId: jobData.id }}
            variant="ghost"
            size="md"
            className="w-full justify-center"
            data-testid="mobile-active-job-view-details-cta"
          >
            {mobileFlowCopy.activeJob.viewJobDetails}
          </TrackedLinkButton>
        </HbCard>
      </section>
    </div>
  );
}

function renderJobNotFoundState() {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard
        data-testid="mobile-active-job-not-found"
        className="space-y-3 text-center"
      >
        <h1 className="hb-heading-1 text-2xl font-semibold">
          {mobileFlowCopy.activeJob.notFoundTitle}
        </h1>
        <p className="hb-muted text-sm">
          {mobileFlowCopy.activeJob.notFoundBody}
        </p>
        <Link href="/m" className="block">
          <HbButton
            variant="primary"
            size="md"
            className="w-full justify-center"
          >
            {mobileFlowCopy.activeJob.notFoundAction}
          </HbButton>
        </Link>
      </HbCard>
    </div>
  );
}
