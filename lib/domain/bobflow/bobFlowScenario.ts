const BOBFLOW_SCENARIOS = [
  "Internal.intake",
  "Internal.diagnose",
  "Internal.materials",
  "Internal.quotes",
  "Internal.invoice",
  "Internal.call_script",
  "Internal.msg",
  "Internal.email",
  "External.calls.followup.quote",
  "External.calls.followup.schedule",
  "External.calls.followup.invoice",
  "External.msg.followup.quote",
  "External.msg.followup.schedule",
  "External.msg.followup.invoice",
  "External.email.followup.quote",
  "External.email.followup.schedule",
  "External.email.followup.invoice",
  "External.calls.notification.arrival_time",
  "External.calls.notification.delay",
  "External.calls.notification.updates",
  "External.msg.notification.arrival_time",
  "External.msg.notification.delay",
  "External.msg.notification.updates",
  "External.email.notification.arrival_time",
  "External.email.notification.delay",
  "External.email.notification.updates",
] as const;

export type BobFlowScenario = (typeof BOBFLOW_SCENARIOS)[number];

export const bobFlowScenarioList: BobFlowScenario[] = BOBFLOW_SCENARIOS;

export const isExternalScenario = (scenario: BobFlowScenario): boolean =>
  scenario.startsWith("External.");

export const isInternalScenario = (scenario: BobFlowScenario): boolean =>
  scenario.startsWith("Internal.");
