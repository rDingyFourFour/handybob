import { describe, expect, it } from "vitest";

import {
  isDialInProgressTwilioStatus,
  isTerminalTwilioDialStatus,
  isTwilioTerminalStatus,
} from "@/lib/domain/calls/sessions";

describe("Twilio dial status helpers", () => {
  it("flags terminal statuses", () => {
    expect(isTerminalTwilioDialStatus("completed")).toBe(true);
    expect(isTerminalTwilioDialStatus("failed")).toBe(true);
    expect(isTerminalTwilioDialStatus("ringing")).toBe(false);
    expect(isTerminalTwilioDialStatus(null)).toBe(false);
  });

  it("identifies in-progress statuses", () => {
    expect(isDialInProgressTwilioStatus("ringing")).toBe(true);
    expect(isDialInProgressTwilioStatus("in-progress")).toBe(true);
    expect(isDialInProgressTwilioStatus("completed")).toBe(false);
    expect(isDialInProgressTwilioStatus(undefined)).toBe(false);
  });
});

describe("Twilio terminal helper", () => {
  it("identifies terminal dial statuses", () => {
    expect(isTwilioTerminalStatus("completed")).toBe(true);
    expect(isTwilioTerminalStatus("busy")).toBe(true);
    expect(isTwilioTerminalStatus("canceled")).toBe(true);
  });

  it("returns false for non-terminal or missing values", () => {
    expect(isTwilioTerminalStatus("ringing")).toBe(false);
    expect(isTwilioTerminalStatus(null)).toBe(false);
    expect(isTwilioTerminalStatus("")).toBe(false);
  });
});
