import Link from "next/link";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import TrackedLinkButton from "@/components/mobile/TrackedLinkButton";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import RunNextStepButton from "./RunNextStepButton";
import {
  bobFlowScenarioList,
  isInternalScenario,
  type BobFlowScenario,
} from "@/lib/domain/bobflow/bobFlowScenario";

type ActionPageSearchParams = {
  scenario?: string | string[] | undefined;
  jobId?: string | string[] | undefined;
  workspaceId?: string | string[] | undefined;
  intent?: string | string[] | undefined;
};

type ValidationState =
  | { type: "missingScenario" }
  | { type: "unknownScenario"; scenario: string }
  | { type: "missingJobData" };

const formatScenarioLabel = (value?: string | null): string => {
  if (!value) {
    return "Unknown scenario";
  }
  return value
    .split(".")
    .filter(Boolean)
    .map((segment) =>
      segment
        .replace(/_/g, " ")
        .replace(/^(\w)/, (chr) => chr.toUpperCase())
        .replace(/([a-z])([A-Z])/g, "$1 $2"),
    )
    .join(" · ");
};

const normalizeSearchParam = (value?: string | string[] | undefined): string | null => {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0]?.trim() || null : value.trim() || null;
};

const isKnownScenario = (value?: string | null): value is BobFlowScenario =>
  typeof value === "string" && bobFlowScenarioList.includes(value as BobFlowScenario);

const buildGeneralValidationState = (params: {
  scenarioParam: string | null;
  scenario: BobFlowScenario | null;
}): ValidationState | null => {
  if (!params.scenarioParam) {
    return { type: "missingScenario" };
  }
  if (!params.scenario) {
    return { type: "unknownScenario", scenario: params.scenarioParam };
  }
  return null;
};

const buildInternalValidationState = (params: {
  jobId: string | null;
  workspaceId: string | null;
}): ValidationState | null => {
  if (!params.jobId || !params.workspaceId) {
    return { type: "missingJobData" };
  }
  return null;
};

const buildConfirmationHref = (params: {
  jobId?: string | null;
  scenario?: BobFlowScenario | null;
}): string => {
  const query = new URLSearchParams({
    handoff: "1",
    confirmed: "1",
  });
  if (params.jobId) {
    query.set("jobId", params.jobId);
  }
  if (params.scenario) {
    query.set("scenario", params.scenario);
  }
  return `/m?${query.toString()}`;
};

const getValidationCopy = (state: ValidationState) => {
  switch (state.type) {
    case "missingScenario":
      return {
        title: "Scenario required",
        body: "We couldn’t start the work without knowing what you need. Return to Home to continue.",
      };
    case "unknownScenario":
      return {
        title: "Unsupported scenario",
        body: `The scenario ${state.scenario} isn’t recognized yet. Return to Home and try again.`,
      };
    case "missingJobData":
      return {
        title: "Job context missing",
        body: "We need a job and workspace to run the work. Return to Home to pick a job.",
      };
  }
};

import { runInternalScenarioAction } from "@/app/m/actions/runInternalScenarioAction";
export { runInternalScenarioAction };

export default async function MobileActionExecutionPage({
  searchParams,
}: {
  searchParams?: Promise<ActionPageSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const scenarioParam = normalizeSearchParam(resolvedSearchParams.scenario);
  const jobId = normalizeSearchParam(resolvedSearchParams.jobId);
  const workspaceId = normalizeSearchParam(resolvedSearchParams.workspaceId);
  const intent = normalizeSearchParam(resolvedSearchParams.intent);
  const scenario = isKnownScenario(scenarioParam) ? scenarioParam : null;
  const generalValidationState = buildGeneralValidationState({
    scenarioParam,
    scenario,
  });
  const isScenarioInternal = Boolean(scenario && isInternalScenario(scenario));
  const internalValidationState =
    isScenarioInternal && !generalValidationState
      ? buildInternalValidationState({ jobId, workspaceId })
      : null;
  const errorState = generalValidationState ?? internalValidationState;
  const scenarioLabel = formatScenarioLabel(scenarioParam);
  const errorCopy = errorState ? getValidationCopy(errorState) : null;
  const shouldShowInternalForm =
    isScenarioInternal && !generalValidationState && !internalValidationState;
  const shouldShowExternalConfirmation =
    Boolean(scenario && !isScenarioInternal && !generalValidationState);
  const confirmHref = buildConfirmationHref({
    scenario: shouldShowExternalConfirmation ? scenario : null,
    jobId,
  });
  const confirmEventPayload = {
    jobId: jobId ?? undefined,
    workspaceId: workspaceId ?? undefined,
    scenario: shouldShowExternalConfirmation ? scenario ?? undefined : undefined,
    confirmed: true,
  };

  return (
    <div data-testid="mobile-action-root" className="space-y-6 pb-8">
      <header className="space-y-2">
        <Link href="/m" className="text-sm font-semibold text-[var(--color-text-secondary)]">
          {mobileFlowCopy.home.title}
        </Link>
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
          Dedicated execution screen
        </h1>
      </header>

      <HbCard className="space-y-4" data-testid="mobile-action-card">
        <div>
          <p
            data-testid="mobile-action-scenario"
            className="text-lg font-semibold text-[var(--color-text-primary)]"
          >
            {scenarioLabel}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">Job ID: {jobId ?? "Not available"}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Workspace ID: {workspaceId ?? "Not available"}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">Intent: {intent ?? "Not available"}</p>
        </div>
        {errorCopy ? (
          <div className="space-y-2" data-testid="mobile-action-error">
            <p className="text-base font-semibold text-[var(--color-text-primary)]">{errorCopy.title}</p>
            <p className="text-sm text-[var(--color-text-secondary)]">{errorCopy.body}</p>
            <HbButton
              as={Link}
              href="/m"
              variant="primary"
              size="md"
              className="w-full justify-center"
              data-testid="mobile-action-back"
            >
              Back to Home
            </HbButton>
          </div>
        ) : shouldShowInternalForm ? (
          <form
            action={runInternalScenarioAction}
            className="space-y-4"
            data-testid="mobile-action-run-form"
          >
            <p className="text-sm text-[var(--color-text-secondary)]">
              Bob is working on the next internal step. Once it lands, you’ll be redirected back to Home.
            </p>
            <input type="hidden" name="scenario" value={scenarioParam ?? ""} />
            <input type="hidden" name="jobId" value={jobId ?? ""} />
            <input type="hidden" name="workspaceId" value={workspaceId ?? ""} />
            <input type="hidden" name="intent" value={intent ?? ""} />
            <RunNextStepButton
              className="w-full justify-center"
              data-testid="mobile-action-run-button"
            />
            <HbButton
              as={Link}
              href="/m"
              variant="secondary"
              size="md"
              className="w-full justify-center"
              data-testid="mobile-action-back"
            >
              Back to Home
            </HbButton>
          </form>
        ) : shouldShowExternalConfirmation ? (
          <div className="space-y-4" data-testid="mobile-action-confirm-section">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Confirming will return you to Home so we can show the latest reassurance copy.
            </p>
            <TrackedLinkButton
              href={confirmHref}
              eventName="[mobile-action-confirm-click]"
              eventPayload={confirmEventPayload}
              className="w-full justify-center"
              data-testid="mobile-action-confirm"
            >
              Confirm
            </TrackedLinkButton>
            <HbButton
              as={Link}
              href="/m"
              variant="secondary"
              size="md"
              className="w-full justify-center"
              data-testid="mobile-action-back"
            >
              Back to Home
            </HbButton>
          </div>
        ) : null}
      </HbCard>
    </div>
  );
}
