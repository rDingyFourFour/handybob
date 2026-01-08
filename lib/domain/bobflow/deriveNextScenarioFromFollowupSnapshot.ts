import type { AskBobFollowupSnapshotPayload } from "@/lib/domain/askbob/types";
import type { BobFlowScenario } from "./bobFlowScenario";

export type DerivedFollowupScenario = BobFlowScenario | "Idle";

const isNonEmptyString = (value?: string | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isUsableFollowupSnapshot = (
  payload: unknown,
): payload is AskBobFollowupSnapshotPayload => {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const candidate = payload as Partial<AskBobFollowupSnapshotPayload>;
  const hasAction =
    isNonEmptyString(candidate.recommendedAction) ||
    (Array.isArray(candidate.steps) && candidate.steps.length > 0);
  return hasAction;
};

export const deriveNextScenarioFromFollowupSnapshot = (
  snapshot: AskBobFollowupSnapshotPayload | null | undefined,
): DerivedFollowupScenario | null => {
  if (!snapshot || !isUsableFollowupSnapshot(snapshot)) {
    return null;
  }

  if (snapshot.shouldSendMessage) {
    return "External.msg.followup.quote";
  }
  if (snapshot.shouldCall) {
    return "External.calls.followup.quote";
  }
  if (snapshot.shouldScheduleVisit) {
    return "External.msg.followup.schedule";
  }
  if (snapshot.shouldWait) {
    return "Idle";
  }

  return null;
};
