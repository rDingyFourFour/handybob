import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import TrackedLinkButton from "@/components/mobile/TrackedLinkButton";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

export default function MobileFollowUpPlaceholderPage({
  searchParams,
}: {
  searchParams?: { jobId?: string | string[] | undefined };
}) {
  const rawJobId = Array.isArray(searchParams?.jobId)
    ? searchParams.jobId[0]
    : searchParams?.jobId;
  const jobId = rawJobId?.trim() || null;
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
          eventPayload={{ jobId }}
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
