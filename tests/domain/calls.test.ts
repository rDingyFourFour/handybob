import { describe, expect, it } from "vitest";

import { handleTwilioVoiceEvent } from "@/lib/domain/calls";

describe("handleTwilioVoiceEvent", () => {
  it("returns TwiML that instructs recording", async () => {
    const response = await handleTwilioVoiceEvent({
      from: "+15555550123",
      to: "+15555550000",
      callSid: "CA123",
    });

    expect(response).toContain("<Record");
    expect(response).toContain("Thanks for calling HandyBob");
  });
});
