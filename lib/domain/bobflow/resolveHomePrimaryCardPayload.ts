import type { BobFlowScenario } from "./bobFlowScenario";
import { homeInstructionFirstCopy } from "@/lib/domain/mobile/homeInstructionCopy";
import { getHomePrimaryCardCopy } from "./homePrimaryCardCopy";
import type { HomePrimaryCardPayload } from "./homePrimaryCardPayload";

type ResolveHomePrimaryCardPayloadArgs = {
  scenario: BobFlowScenario | "Idle";
  jobId?: string | null;
  jobTitle?: string | null;
  workspaceId?: string | null;
  isFollowupDraftReady?: boolean;
  fallbackHref?: string | null;
  telemetryPayload?: Record<string, unknown>;
  customerName?: string | null;
};

const assertNever = (value: never): never => {
  throw new Error(`Unhandled scenario: ${String(value)}`);
};

const buildFollowUpHref = (
  jobId?: string | null,
  workspaceId?: string | null,
  fallbackHref?: string | null,
): string | undefined => {
  if (jobId?.trim() && workspaceId?.trim()) {
    const params = new URLSearchParams({
      jobId: jobId.trim(),
      workspaceId: workspaceId.trim(),
    });
    return `/m/follow-up?${params.toString()}`;
  }
  return fallbackHref ?? undefined;
};

const buildActionHref = (
  scenario: BobFlowScenario,
  jobId?: string | null,
  workspaceId?: string | null,
  fallbackHref?: string | null,
  extraParams?: Record<string, string | undefined>,
): string | undefined => {
  const trimmedJobId = jobId?.trim();
  const trimmedWorkspaceId = workspaceId?.trim();
  if (!trimmedJobId || !trimmedWorkspaceId) {
    return fallbackHref ?? undefined;
  }
  const params = new URLSearchParams({
    scenario,
    jobId: trimmedJobId,
    workspaceId: trimmedWorkspaceId,
  });
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) {
        const trimmedValue = value.trim();
        if (trimmedValue) {
          params.set(key, trimmedValue);
        }
      }
    }
  }
  return `/m/action?${params.toString()}`;
};

const normalizeCustomerLine = (customerName?: string | null): string | undefined => {
  const trimmedName = customerName?.trim();
  return trimmedName ? trimmedName : undefined;
};

const createPayload = (
  scenario: BobFlowScenario,
  title: string,
  subcopy: string | undefined,
  intent: HomePrimaryCardPayload["intent"],
  requiresUserIntervention: boolean,
  telemetryPayload: Record<string, unknown>,
  ctaIntent: HomePrimaryCardPayload["ctaIntent"],
  ctaLabel?: string,
  href?: string,
  customerLine?: string | null,
): HomePrimaryCardPayload => ({
  scenario,
  title,
  subcopy,
  intent,
  requiresUserIntervention,
  telemetryPayload,
  ctaIntent,
  ctaLabel,
  href,
  customerLine,
});

const buildInternalPayload = (
  scenario: BobFlowScenario,
  copy: ReturnType<typeof getHomePrimaryCardCopy>,
  jobId?: string | null,
  workspaceId?: string | null,
  fallbackHref?: string | null,
  telemetryPayload: Record<string, unknown>,
  customerLine: string,
): HomePrimaryCardPayload => {
  const href = buildActionHref(
    scenario,
    jobId,
    workspaceId,
    fallbackHref,
    { intent: "move_on" },
  );
  return createPayload(
    scenario,
    copy.title,
    copy.subcopy,
    "internal",
    false,
    telemetryPayload,
    "move_on",
    copy.ctaLabel ?? "Move on",
    href,
    customerLine,
  );
};

const buildExternalFollowupPayload = (
  scenario: BobFlowScenario,
  copy: ReturnType<typeof getHomePrimaryCardCopy>,
  jobId?: string | null,
  workspaceId?: string | null,
  fallbackHref?: string | null,
  telemetryPayload: Record<string, unknown>,
): HomePrimaryCardPayload => {
  const href = buildFollowUpHref(jobId, workspaceId, fallbackHref);
  return createPayload(
    scenario,
    copy.title,
    copy.subcopy,
    "external",
    true,
    telemetryPayload,
    "follow_up",
    copy.ctaLabel ?? "Send follow-up",
    href,
  );
};

const buildExternalActionPayload = (
  scenario: BobFlowScenario,
  copy: ReturnType<typeof getHomePrimaryCardCopy>,
  jobId?: string | null,
  workspaceId?: string | null,
  fallbackHref?: string | null,
  telemetryPayload: Record<string, unknown>,
): HomePrimaryCardPayload => {
  const href = buildActionHref(scenario, jobId, workspaceId, fallbackHref);
  return createPayload(
    scenario,
    copy.title,
    copy.subcopy,
    "external",
    true,
    telemetryPayload,
    "review",
    copy.ctaLabel ?? "Send follow-up",
    href,
  );
};

export const resolveHomePrimaryCardPayload = ({
  scenario,
  jobId,
  jobTitle,
  workspaceId,
  isFollowupDraftReady = false,
  fallbackHref,
  telemetryPayload = {},
  customerName,
}: ResolveHomePrimaryCardPayloadArgs): HomePrimaryCardPayload | null => {
  if (scenario === "Idle") {
    return null;
  }

  const copy = getHomePrimaryCardCopy(scenario, jobTitle ?? undefined);
  if (isFollowupDraftReady && scenario === "Internal.msg") {
    copy.title = homeInstructionFirstCopy.followup_draft_ready.instructionTitle;
    copy.subcopy = homeInstructionFirstCopy.followup_draft_ready.instructionSubcopy;
  }

  switch (scenario) {
    // Display order: title → customerLine → reassurance → CTA.
    case "Internal.intake":
    case "Internal.diagnose":
    case "Internal.materials":
    case "Internal.quotes":
    case "Internal.invoice":
    case "Internal.call_script":
    case "Internal.msg":
    case "Internal.email":
        {
          const customerLine = normalizeCustomerLine(customerName);
          if (!customerLine) {
            throw new Error(
              `Internal scenario ${scenario} requires a customer name; ensure the Mobile Home job query joins the customer record.`,
            );
          }
          return buildInternalPayload(
            scenario,
            copy,
            jobId,
            workspaceId,
            fallbackHref,
            telemetryPayload,
            customerLine,
          );
        }

    case "External.calls.followup.quote":
    case "External.calls.followup.schedule":
    case "External.calls.followup.invoice":
    case "External.msg.followup.quote":
    case "External.msg.followup.schedule":
    case "External.msg.followup.invoice":
    case "External.email.followup.quote":
    case "External.email.followup.schedule":
    case "External.email.followup.invoice":
      return buildExternalFollowupPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );

    case "External.calls.notification.arrival_time":
      // TODO: replace this placeholder with the /m/calls/arrival screen once that arrival notification flow ships.
      return buildExternalActionPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );
    case "External.calls.notification.delay":
      // TODO: replace this placeholder with the /m/calls/delay screen once that delay notification flow ships.
      return buildExternalActionPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );
    case "External.calls.notification.updates":
      // TODO: replace this placeholder with the /m/calls/updates screen once that update notification flow ships.
      return buildExternalActionPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );
    case "External.msg.notification.arrival_time":
      // TODO: replace this placeholder with the /m/messages/arrival screen once that arrival notification flow ships.
      return buildExternalActionPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );
    case "External.msg.notification.delay":
      // TODO: replace this placeholder with the /m/messages/delay screen once that delay notification flow ships.
      return buildExternalActionPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );
    case "External.msg.notification.updates":
      // TODO: replace this placeholder with the /m/messages/updates screen once that update notification flow ships.
      return buildExternalActionPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );
    case "External.email.notification.arrival_time":
      // TODO: replace this placeholder with the /m/email/notifications/arrival screen once that arrival notification flow ships.
      return buildExternalActionPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );
    case "External.email.notification.delay":
      // TODO: replace this placeholder with the /m/email/notifications/delay screen once that delay notification flow ships.
      return buildExternalActionPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );
    case "External.email.notification.updates":
      // TODO: replace this placeholder with the /m/email/notifications/updates screen once that update notification flow ships.
      return buildExternalActionPayload(
        scenario,
        copy,
        jobId,
        workspaceId,
        fallbackHref,
        telemetryPayload,
      );

    default:
      assertNever(scenario);
  }
};
