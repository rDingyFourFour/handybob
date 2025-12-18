import { describe, expect, it } from "vitest";

import {
  isDialInProgressTwilioStatus,
  isTerminalTwilioDialStatus,
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
