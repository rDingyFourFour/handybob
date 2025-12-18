import { describe, expect, it } from "vitest";

import { buildCallSessionFollowupReadiness } from "@/lib/domain/calls/sessions";

describe("buildCallSessionFollowupReadiness", () => {
  it("returns ready when the call is terminal and has an outcome", () => {
    const readiness = buildCallSessionFollowupReadiness({
      call: {
        twilio_status: "completed",
        outcome_code: "reached_needs_followup",
        outcome_notes: "Follow-up note",
        outcome_recorded_at: "2024-01-01T12:00:00.000Z",
      },
    });
    expect(readiness.isReady).toBe(true);
    expect(readiness.reasons).toEqual([]);
  });

  it("reports not_terminal when the Twilio status is still in flight", () => {
    const readiness = buildCallSessionFollowupReadiness({
      call: {
        twilio_status: "ringing",
        outcome_code: "reached_needs_followup",
        outcome_notes: "Live note",
        outcome_recorded_at: "2024-01-01T12:00:00.000Z",
      },
    });
    expect(readiness.isReady).toBe(false);
    expect(readiness.reasons).toContain("not_terminal");
  });

  it("reports no_outcome when no outcome data is present even if the call is terminal", () => {
    const readiness = buildCallSessionFollowupReadiness({
      call: {
        twilio_status: "completed",
        outcome_notes: null,
        outcome_code: null,
        outcome_recorded_at: null,
      },
    });
    expect(readiness.isReady).toBe(false);
    expect(readiness.reasons).toContain("no_outcome");
  });

  it("reports no_call_session when no call is provided", () => {
    const readiness = buildCallSessionFollowupReadiness({ call: null });
    expect(readiness.isReady).toBe(false);
    expect(readiness.reasons).toEqual(["no_call_session"]);
  });
});
