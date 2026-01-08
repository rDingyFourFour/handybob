import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import TrackedLinkButton from "@/components/mobile/TrackedLinkButton";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

type ActionPageSearchParams = {
  scenario?: string | string[] | undefined;
  jobId?: string | string[] | undefined;
  workspaceId?: string | string[] | undefined;
  intent?: string | string[] | undefined;
};

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
        .replace(/^\w/, (chr) => chr.toUpperCase())
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

export default async function MobileActionExecutionPage({
  searchParams,
}: {
  searchParams?: Promise<ActionPageSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const scenario = normalizeSearchParam(resolvedSearchParams.scenario);
  const jobId = normalizeSearchParam(resolvedSearchParams.jobId);
  const workspaceId = normalizeSearchParam(resolvedSearchParams.workspaceId);
  const intent = normalizeSearchParam(resolvedSearchParams.intent);

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
            {formatScenarioLabel(scenario)}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Job ID: {jobId ?? "Not available"}
          </p>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Workspace ID: {workspaceId ?? "Not available"}
        </p>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Intent: {intent ?? "Not available"}
        </p>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">
          This is the dedicated execution screen; Home stays the orchestrator.
        </p>
        <TrackedLinkButton
          href="/m"
          eventName="[mobile-action-back-click]"
          eventPayload={{ scenario, jobId, workspaceId, intent }}
          variant="primary"
          size="md"
          className="w-full justify-center"
          data-testid="mobile-action-back"
        >
          Back to Home
        </TrackedLinkButton>
      </HbCard>
    </div>
  );
}
