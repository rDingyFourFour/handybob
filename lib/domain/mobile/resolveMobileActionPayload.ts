import { bobFlowScenarioList, isExternalScenario, type BobFlowScenario } from "@/lib/domain/bobflow/bobFlowScenario";

const HEADLINE = "Dedicated execution screen";
const PRIMARY_EVENT_NAME = "[mobile-action-primary-click]";
const CONFIRM_EVENT_NAME = "[mobile-action-confirm-click]";

const isFollowupScenario = (scenario: BobFlowScenario): boolean => scenario.includes(".followup.");
const isNotificationScenario = (scenario: BobFlowScenario): boolean => scenario.includes(".notification.");

const normalizeId = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const formatBreadcrumb = (scenario: BobFlowScenario): string =>
  scenario
    .split(".")
    .filter(Boolean)
    .map((segment) =>
      segment
        .replace(/_/g, " ")
        .replace(/^(\w)/, (chr) => chr.toUpperCase())
        .replace(/([a-z])([A-Z])/g, "$1 $2"),
    )
    .join(" · ");

const buildFollowupHref = ({
  jobId,
  workspaceId,
  scenario,
}: {
  jobId?: string | null;
  workspaceId?: string | null;
  scenario: BobFlowScenario;
}): string => {
  const params = new URLSearchParams();
  if (jobId) {
    params.set("jobId", jobId);
  }
  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }
  params.set("scenario", scenario);
  return `/m/follow-up?${params.toString()}`;
};

const buildJobHref = (jobId: string): string => `/m/jobs/${encodeURIComponent(jobId)}`;

const buildConfirmHref = ({
  scenario,
  jobId,
  workspaceId,
}: {
  scenario: BobFlowScenario;
  jobId?: string | null;
  workspaceId?: string | null;
}): string => {
  const params = new URLSearchParams({
    handoff: "1",
    confirmed: "1",
    executed: "0",
    scenario,
  });
  if (jobId) {
    params.set("jobId", jobId);
  }
  if (workspaceId) {
    params.set("workspaceId", workspaceId);
  }
  return `/m?${params.toString()}`;
};

const buildEventPayload = ({
  scenario,
  jobId,
  workspaceId,
}: {
  scenario: BobFlowScenario;
  jobId?: string | null;
  workspaceId?: string | null;
}): Record<string, unknown> => {
  const payload: Record<string, unknown> = { scenario };
  if (jobId) {
    payload.jobId = jobId;
  }
  if (workspaceId) {
    payload.workspaceId = workspaceId;
  }
  return payload;
};

export type MobileActionCta = {
  label: string;
  href: string;
  eventName: string;
  eventPayload: Record<string, unknown>;
};

export type MobileActionPayload = {
  scenario: BobFlowScenario;
  headline: string;
  breadcrumb: string;
  description: string;
  jobId?: string;
  workspaceId?: string;
  primaryCta?: MobileActionCta;
  confirmCta: MobileActionCta;
};

type ResolveResult =
  | { kind: "redirect"; href: "/m" }
  | { kind: "render"; payload: MobileActionPayload };

export const resolveMobileActionPayload = ({
  scenario,
  jobId,
  workspaceId,
}: {
  scenario?: string | null;
  jobId?: string | null;
  workspaceId?: string | null;
}): ResolveResult => {
  if (!scenario || typeof scenario !== "string") {
    return { kind: "redirect", href: "/m" };
  }
  const normalizedScenario = scenario.trim();
  if (!normalizedScenario) {
    return { kind: "redirect", href: "/m" };
  }
  if (!bobFlowScenarioList.includes(normalizedScenario as BobFlowScenario)) {
    return { kind: "redirect", href: "/m" };
  }
  const bobScenario = normalizedScenario as BobFlowScenario;
  if (!isExternalScenario(bobScenario)) {
    return { kind: "redirect", href: "/m" };
  }

  const normalizedJobId = normalizeId(jobId);
  const normalizedWorkspaceId = normalizeId(workspaceId);

  const eventPayload = buildEventPayload({
    scenario: bobScenario,
    jobId: normalizedJobId,
    workspaceId: normalizedWorkspaceId,
  });

  let primaryCta: MobileActionCta | undefined;
  if (isFollowupScenario(bobScenario) && normalizedJobId && normalizedWorkspaceId) {
    primaryCta = {
      label: "Review text draft",
      href: buildFollowupHref({
        jobId: normalizedJobId,
        workspaceId: normalizedWorkspaceId,
        scenario: bobScenario,
      }),
      eventName: PRIMARY_EVENT_NAME,
      eventPayload,
    };
  } else if (!isFollowupScenario(bobScenario) && normalizedJobId) {
    primaryCta = {
      label: "View job details",
      href: buildJobHref(normalizedJobId),
      eventName: PRIMARY_EVENT_NAME,
      eventPayload,
    };
  }

  const confirmCta: MobileActionCta = {
    label: "Confirm",
    href: buildConfirmHref({
      scenario: bobScenario,
      jobId: normalizedJobId,
      workspaceId: normalizedWorkspaceId,
    }),
    eventName: CONFIRM_EVENT_NAME,
    eventPayload: {
      ...eventPayload,
      confirmed: true,
    },
  };

  const description = isFollowupScenario(bobScenario)
    ? "Review the draft and confirm when you’re ready to return to Home."
    : isNotificationScenario(bobScenario)
    ? "Review the details and confirm when you’re ready to return to Home."
    : "Review the next step and confirm when you’re ready to return to Home.";

  return {
    kind: "render",
    payload: {
      scenario: bobScenario,
      headline: HEADLINE,
      breadcrumb: formatBreadcrumb(bobScenario),
      description,
      jobId: normalizedJobId ?? undefined,
      workspaceId: normalizedWorkspaceId ?? undefined,
      primaryCta,
      confirmCta,
    },
  };
};
