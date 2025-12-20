import { describe, expect, it } from "vitest";

import { CallAutomatedDialSnapshot, getCallSessionOutcomeMissingReason } from "@/lib/domain/calls/sessions";

describe("getCallSessionOutcomeMissingReason", () => {
  it("returns missing_outcome when a terminal call lacks outcome data", () => {
    const snapshot: Pick<CallAutomatedDialSnapshot, "isTerminal" | "hasOutcome" | "reachedCustomer"> = {
      isTerminal: true,
      hasOutcome: false,
      reachedCustomer: null,
    };
    expect(getCallSessionOutcomeMissingReason(snapshot)).toBe("missing_outcome");
  });

  it("returns missing_reached_flag when outcome exists but reached flag is unset", () => {
    const snapshot: Pick<CallAutomatedDialSnapshot, "isTerminal" | "hasOutcome" | "reachedCustomer"> = {
      isTerminal: true,
      hasOutcome: true,
      reachedCustomer: null,
    };
    expect(getCallSessionOutcomeMissingReason(snapshot)).toBe("missing_reached_flag");
  });

  it("returns ready when the call is not terminal", () => {
    const snapshot: Pick<CallAutomatedDialSnapshot, "isTerminal" | "hasOutcome" | "reachedCustomer"> = {
      isTerminal: false,
      hasOutcome: false,
      reachedCustomer: null,
    };
    expect(getCallSessionOutcomeMissingReason(snapshot)).toBe("ready");
  });

  it("returns ready when all prerequisites are met", () => {
    const snapshot: Pick<CallAutomatedDialSnapshot, "isTerminal" | "hasOutcome" | "reachedCustomer"> = {
      isTerminal: true,
      hasOutcome: true,
      reachedCustomer: true,
    };
    expect(getCallSessionOutcomeMissingReason(snapshot)).toBe("ready");
  });
});
