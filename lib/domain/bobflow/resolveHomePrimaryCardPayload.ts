import type { BobFlowScenario } from "./bobFlowScenario";
import { homeInstructionFirstCopy } from "@/lib/domain/mobile/homeInstructionCopy";
import {
  getHomePrimaryCardCopy,
  FOLLOWUP_RECOMMENDATION_SUBCOPY,
} from "./homePrimaryCardCopy";
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
  followupSnapshotDriven?: boolean;
};

const isFollowupScenario = (scenario: BobFlowScenario): boolean =>
  scenario.includes(".followup.");

const isNotificationScenario = (scenario: BobFlowScenario): boolean =>
  scenario.includes(".notification.");

const isExternalScenario = (scenario: BobFlowScenario): boolean =>
  scenario.startsWith("External.");

const assertNever = (value: never): never => {
  throw new Error(`Unhandled scenario: ${String(value)}`);
};

const enforceHomeRoutingContract = (payload: HomePrimaryCardPayload): void => {
  const { scenario, ctaIntent, href } = payload;
  if (scenario.startsWith("Internal.")) {
    if (ctaIntent !== "move_on") {
      throw new Error(
        `Internal scenario ${scenario} must use move_on CTA intent, got ${ctaIntent}`,
      );
    }
    if (href !== undefined) {
      throw new Error(`Internal scenario ${scenario} must not expose a navigation href`);
    }
    return;
  }

  if (!isExternalScenario(scenario)) {
    return;
  }

  if (ctaIntent === "move_on") {
    throw new Error(`External scenario ${scenario} must not use move_on CTA intent`);
  }

  if (isFollowupScenario(scenario)) {
    if (href && !href.startsWith("/m/action")) {
      throw new Error(`Follow-up scenario ${scenario} must route to /m/action`);
    }
    return;
  }

  if (isNotificationScenario(scenario)) {
    if (href?.startsWith("/m/action")) {
      throw new Error(`Notification scenario ${scenario} must not route through /m/action`);
    }
    return;
  }

  if (href !== undefined && !href.startsWith("/m/action")) {
    throw new Error(`External scenario ${scenario} must route to /m/action`);
  }
};

const normalizeCustomerLine = (customerName?: string | null): string | undefined => {
  const trimmedName = customerName?.trim();
  return trimmedName ? trimmedName : undefined;
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

const buildNotificationHref = (fallbackHref?: string | null): string | undefined =>
  fallbackHref ?? undefined;

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
  telemetryPayload: Record<string, unknown>,
  customerLine: string,
): HomePrimaryCardPayload => {
  const href = undefined;
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
  customerLine?: string,
): HomePrimaryCardPayload => {
  const href = buildActionHref(scenario, jobId, workspaceId, fallbackHref);
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
    customerLine,
  );
};

const buildExternalActionPayload = (
  scenario: BobFlowScenario,
  copy: ReturnType<typeof getHomePrimaryCardCopy>,
  jobId?: string | null,
  workspaceId?: string | null,
  fallbackHref?: string | null,
  telemetryPayload: Record<string, unknown>,
  hrefResolver?: () => string | undefined,
): HomePrimaryCardPayload => {
  const href =
    typeof hrefResolver === "function"
      ? hrefResolver()
      : buildActionHref(scenario, jobId, workspaceId, fallbackHref);
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
  followupSnapshotDriven = false,
}: ResolveHomePrimaryCardPayloadArgs): HomePrimaryCardPayload | null => {
  if (scenario === "Idle") {
    return null;
  }

  const normalizedCustomerLine = normalizeCustomerLine(customerName);

  let copy = getHomePrimaryCardCopy(scenario, jobTitle ?? undefined);
  const shouldShowFollowupDraftReadyCopy =
    isFollowupDraftReady &&
    (scenario === "Internal.msg" || scenario === "External.msg.followup.schedule");
  if (shouldShowFollowupDraftReadyCopy) {
    copy.title = homeInstructionFirstCopy.followup_draft_ready.instructionTitle;
    copy.subcopy = homeInstructionFirstCopy.followup_draft_ready.instructionSubcopy;
  }
  const shouldShowDerivedScheduleCopy =
    followupSnapshotDriven && scenario === "External.msg.followup.schedule" && !shouldShowFollowupDraftReadyCopy;
  if (shouldShowDerivedScheduleCopy) {
    copy = {
      ...copy,
      title: jobTitle ?? copy.title,
      subcopy: FOLLOWUP_RECOMMENDATION_SUBCOPY,
      ctaLabel: "Schedule visit",
    };
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
          const payload = buildInternalPayload(
            scenario,
            copy,
            telemetryPayload,
            customerLine,
          );
          enforceHomeRoutingContract(payload);
          return payload;
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
      {
        const payload = buildExternalFollowupPayload(
          scenario,
          copy,
          jobId,
          workspaceId,
          fallbackHref,
          telemetryPayload,
          normalizedCustomerLine,
        );
        enforceHomeRoutingContract(payload);
        return payload;
      }

    case "External.calls.notification.arrival_time":
    case "External.calls.notification.delay":
    case "External.calls.notification.updates":
    case "External.msg.notification.arrival_time":
    case "External.msg.notification.delay":
    case "External.msg.notification.updates":
    case "External.email.notification.arrival_time":
    case "External.email.notification.delay":
    case "External.email.notification.updates":
      // TODO: replace these placeholders with the real notification screens once shipped.
      {
        const payload = buildExternalActionPayload(
          scenario,
          copy,
          jobId,
          workspaceId,
          fallbackHref,
          telemetryPayload,
          () => buildNotificationHref(fallbackHref),
        );
        enforceHomeRoutingContract(payload);
        return payload;
      }

    default:
      assertNever(scenario);
  }
};
