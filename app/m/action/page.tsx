import Link from "next/link";
import { redirect } from "next/navigation";

import HbCard from "@/components/ui/hb-card";
import TrackedLinkButton from "@/components/mobile/TrackedLinkButton";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import { resolveMobileActionPayload } from "@/lib/domain/mobile/resolveMobileActionPayload";

export { runInternalScenarioAction } from "@/app/m/actions/runInternalScenarioAction";

type ActionPageSearchParams = {
  scenario?: string | string[] | undefined;
  jobId?: string | string[] | undefined;
  workspaceId?: string | string[] | undefined;
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
  const scenarioParam = normalizeSearchParam(resolvedSearchParams.scenario);
  const jobIdParam = normalizeSearchParam(resolvedSearchParams.jobId);
  const workspaceIdParam = normalizeSearchParam(resolvedSearchParams.workspaceId);
  const result = resolveMobileActionPayload({
    scenario: scenarioParam,
    jobId: jobIdParam,
    workspaceId: workspaceIdParam,
  });

  if (result.kind === "redirect") {
    redirect(result.href);
  }

  const {
    payload: {
      headline,
      breadcrumb,
      description,
      primaryCta,
      confirmCta,
      jobId,
      workspaceId,
    },
  } = result;

  return (
    <div data-testid="mobile-action-root" className="space-y-6 pb-8">
      <header className="space-y-2">
        <Link href="/m" className="text-sm font-semibold text-[var(--color-text-secondary)]">
          {mobileFlowCopy.home.title}
        </Link>
        <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">{headline}</h1>
      </header>

      <HbCard className="space-y-4" data-testid="mobile-action-card">
        <div>
          <p
            data-testid="mobile-action-scenario"
            className="text-lg font-semibold text-[var(--color-text-primary)]"
          >
            {breadcrumb}
          </p>
          {jobId && (
            <p className="text-sm text-[var(--color-text-secondary)]">Job ID: {jobId}</p>
          )}
          {workspaceId && (
            <p className="text-sm text-[var(--color-text-secondary)]">Workspace ID: {workspaceId}</p>
          )}
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>

        <div className="space-y-3" data-testid="mobile-action-controls">
          {primaryCta && (
            <TrackedLinkButton
              href={primaryCta.href}
              eventName={primaryCta.eventName}
              eventPayload={primaryCta.eventPayload}
              className="w-full justify-center"
              data-testid="mobile-action-primary"
            >
              {primaryCta.label}
            </TrackedLinkButton>
          )}
          <TrackedLinkButton
            href={confirmCta.href}
            eventName={confirmCta.eventName}
            eventPayload={confirmCta.eventPayload}
            variant="secondary"
            className="w-full justify-center"
            data-testid="mobile-action-confirm"
          >
            {confirmCta.label}
          </TrackedLinkButton>
        </div>
      </HbCard>
    </div>
  );
}
