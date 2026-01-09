import type { BobFlowScenario } from "./bobFlowScenario";
import type { DerivedFollowupScenario } from "./deriveNextScenarioFromFollowupSnapshot";

type HomePrimaryCardCopyTemplate = {
  title: string;
  subcopy?: string;
  ctaLabel?: string;
};

const JOB_TITLE_TOKEN = "{jobTitle}";
const DEFAULT_JOB_TITLE = "your job";

export const INTERNAL_REASSURANCE_SUBCOPY =
  "Everything's on track. Ready for the next step.";

export const INTERNAL_HANDOFF_SUBCOPY = "Done. Ready for the next step.";

const INTERNAL_DEFAULT_COPY: HomePrimaryCardCopyTemplate = {
  title: JOB_TITLE_TOKEN,
  subcopy: INTERNAL_REASSURANCE_SUBCOPY,
  ctaLabel: "Move on",
};

export const FOLLOWUP_RECOMMENDATION_SUBCOPY = "Here’s what Bob recommends next.";

const EXTERNAL_FOLLOWUP_COPY: HomePrimaryCardCopyTemplate = {
  title: "Send a follow-up for the {jobTitle}",
  subcopy: "The customer hasn't confirmed timing yet.",
  ctaLabel: "Send follow-up",
};

const FOLLOWUP_MESSAGE_COPY: HomePrimaryCardCopyTemplate = {
  title: JOB_TITLE_TOKEN,
  subcopy: FOLLOWUP_RECOMMENDATION_SUBCOPY,
  ctaLabel: "Send message",
};

const FOLLOWUP_CALL_COPY: HomePrimaryCardCopyTemplate = {
  title: JOB_TITLE_TOKEN,
  subcopy: FOLLOWUP_RECOMMENDATION_SUBCOPY,
  ctaLabel: "Call customer",
};

const CALLS_NOTIFICATION_TEMPLATE: HomePrimaryCardCopyTemplate = {
  title: "Share an arrival update for {jobTitle}",
  subcopy: "Let the customer know when you’ll be on site so they can plan accordingly.",
  ctaLabel: "Send follow-up",
};

const MESSAGE_NOTIFICATION_TEMPLATE: HomePrimaryCardCopyTemplate = {
  title: "Send an arrival update for {jobTitle}",
  subcopy: "Ping the customer in Messages so they can expect you.",
  ctaLabel: "Send follow-up",
};

const EMAIL_NOTIFICATION_TEMPLATE: HomePrimaryCardCopyTemplate = {
  title: "Send a customer update for {jobTitle}",
  subcopy: "Let them know what’s happening next so nothing slips through the cracks.",
  ctaLabel: "Send follow-up",
};

const SCENARIO_COPY: Record<BobFlowScenario, HomePrimaryCardCopyTemplate> = {
  "Internal.intake": INTERNAL_DEFAULT_COPY,
  "Internal.diagnose": INTERNAL_DEFAULT_COPY,
  "Internal.materials": INTERNAL_DEFAULT_COPY,
  "Internal.quotes": INTERNAL_DEFAULT_COPY,
  "Internal.invoice": INTERNAL_DEFAULT_COPY,
  "Internal.call_script": INTERNAL_DEFAULT_COPY,
  "Internal.msg": INTERNAL_DEFAULT_COPY,
  "Internal.email": INTERNAL_DEFAULT_COPY,
  "External.calls.followup.quote": FOLLOWUP_CALL_COPY,
  "External.calls.followup.schedule": {
    title: "Book a follow-up call for the {jobTitle}",
    subcopy: "Coordinate a call so the customer hears from you at the right time.",
    ctaLabel: "Send follow-up",
  },
  "External.calls.followup.invoice": EXTERNAL_FOLLOWUP_COPY,
  "External.msg.followup.quote": FOLLOWUP_MESSAGE_COPY,
  "External.msg.followup.schedule": EXTERNAL_FOLLOWUP_COPY,
  "External.msg.followup.invoice": EXTERNAL_FOLLOWUP_COPY,
  "External.email.followup.quote": EXTERNAL_FOLLOWUP_COPY,
  "External.email.followup.schedule": EXTERNAL_FOLLOWUP_COPY,
  "External.email.followup.invoice": EXTERNAL_FOLLOWUP_COPY,
  "External.calls.notification.arrival_time": CALLS_NOTIFICATION_TEMPLATE,
  "External.calls.notification.delay": CALLS_NOTIFICATION_TEMPLATE,
  "External.calls.notification.updates": CALLS_NOTIFICATION_TEMPLATE,
  "External.msg.notification.arrival_time": MESSAGE_NOTIFICATION_TEMPLATE,
  "External.msg.notification.delay": MESSAGE_NOTIFICATION_TEMPLATE,
  "External.msg.notification.updates": MESSAGE_NOTIFICATION_TEMPLATE,
  "External.email.notification.arrival_time": EMAIL_NOTIFICATION_TEMPLATE,
  "External.email.notification.delay": EMAIL_NOTIFICATION_TEMPLATE,
  "External.email.notification.updates": EMAIL_NOTIFICATION_TEMPLATE,
};

const replaceJobTitle = (value: string, jobTitle?: string | null): string => {
  const safeTitle = jobTitle?.trim() || DEFAULT_JOB_TITLE;
  return value.split(JOB_TITLE_TOKEN).join(safeTitle);
};

export const getHomePrimaryCardCopy = (
  scenario: BobFlowScenario,
  jobTitle?: string | null,
): HomePrimaryCardCopyTemplate => {
  const template = SCENARIO_COPY[scenario];
  if (!template) {
    throw new Error(`Missing copy for scenario ${scenario}`);
  }
  return {
    title: replaceJobTitle(template.title, jobTitle),
    subcopy: template.subcopy ? replaceJobTitle(template.subcopy, jobTitle) : undefined,
    ctaLabel: template.ctaLabel,
  };
};

const HANDOFF_REASSURANCE_COPY: Partial<Record<DerivedFollowupScenario, string>> = {
  "External.msg.followup.quote": "I drafted a follow-up message based on your quote.",
  "External.calls.followup.quote": "I put together a quick call plan based on your quote.",
  "External.email.followup.quote": "I prepared an email follow-up based on your quote.",
};

const DEFAULT_HANDOFF_REASSURANCE_COPY = "I've prepared the next step for you.";

export const getHomePrimaryCardHandoffCopy = (
  scenario: DerivedFollowupScenario,
): string => {
  return HANDOFF_REASSURANCE_COPY[scenario] ?? DEFAULT_HANDOFF_REASSURANCE_COPY;
};
