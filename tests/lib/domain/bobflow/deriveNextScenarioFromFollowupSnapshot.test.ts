import { describe, expect, it } from "vitest";

import {
  deriveNextScenarioFromFollowupSnapshot,
  isUsableFollowupSnapshot,
} from "@/lib/domain/bobflow/deriveNextScenarioFromFollowupSnapshot";

const BASE_SNAPSHOT = {
  recommendedAction: "Follow up",
  rationale: "Check in",
  steps: [{ label: "follow" }],
  shouldSendMessage: false,
  shouldCall: false,
  shouldScheduleVisit: false,
  shouldWait: false,
  modelLatencyMs: 1,
};

describe("deriveNextScenarioFromFollowupSnapshot", () => {
  it("identifies a usable payload", () => {
    expect(isUsableFollowupSnapshot(BASE_SNAPSHOT)).toBe(true);
  });

  it("returns the send message scenario when shouldSendMessage is true", () => {
    const snapshot = { ...BASE_SNAPSHOT, shouldSendMessage: true };
    expect(deriveNextScenarioFromFollowupSnapshot(snapshot)).toBe(
      "External.msg.followup.quote",
    );
  });

  it("returns the call scenario when shouldCall is true", () => {
    const snapshot = { ...BASE_SNAPSHOT, shouldCall: true };
    expect(deriveNextScenarioFromFollowupSnapshot(snapshot)).toBe(
      "External.calls.followup.quote",
    );
  });

  it("returns the schedule scenario when shouldScheduleVisit is true", () => {
    const snapshot = { ...BASE_SNAPSHOT, shouldScheduleVisit: true };
    expect(deriveNextScenarioFromFollowupSnapshot(snapshot)).toBe(
      "External.msg.followup.schedule",
    );
  });

  it("returns Idle when shouldWait is true", () => {
    const snapshot = { ...BASE_SNAPSHOT, shouldWait: true };
    expect(deriveNextScenarioFromFollowupSnapshot(snapshot)).toBe("Idle");
  });

  it("returns null when no actionable flags are set", () => {
    expect(deriveNextScenarioFromFollowupSnapshot(BASE_SNAPSHOT)).toBeNull();
  });
});
