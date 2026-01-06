import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import TrackedLinkButton from "@/components/mobile/TrackedLinkButton";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

type FollowUpPageSearchParams = {
  jobId?: string | string[] | undefined;
  workspaceId?: string | string[] | undefined;
};

export default async function MobileFollowUpPlaceholderPage({
  searchParams,
}: {
  searchParams?: Promise<FollowUpPageSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawJobId = Array.isArray(resolvedSearchParams.jobId)
    ? resolvedSearchParams.jobId[0]
    : resolvedSearchParams.jobId;
  const rawWorkspaceId = Array.isArray(resolvedSearchParams.workspaceId)
    ? resolvedSearchParams.workspaceId[0]
    : resolvedSearchParams.workspaceId;
  const jobId = rawJobId?.trim() || null;
  const workspaceId = rawWorkspaceId?.trim() || null;
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
          {mobileFlowCopy.followupPlaceholder.description}
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
      </HbCard>
    </div>
  );
}
