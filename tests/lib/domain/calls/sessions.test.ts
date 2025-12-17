import { describe, expect, it } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { updateCallSessionTwilioStatus } from "@/lib/domain/calls/sessions";

describe("updateCallSessionTwilioStatus", () => {
  it("ignores non-terminal updates after a terminal status", async () => {
    const supabaseState = setupSupabaseMock({
      calls: [
        {
          data: [
            {
              id: "call-1",
              twilio_status: "completed",
            },
          ],
          error: null,
        },
        { data: [], error: null },
      ],
    });

    const result = await updateCallSessionTwilioStatus({
      supabase: supabaseState.supabase,
      callId: "call-1",
      twilioStatus: "ringing",
    });

    expect(result).toMatchObject({
      applied: false,
      currentStatus: "completed",
      reason: "precedence_ignored",
    });
  });

  it("applies repeated terminal updates for matching statuses", async () => {
    const supabaseState = setupSupabaseMock({
      calls: [
        {
          data: [
            {
              id: "call-2",
              twilio_status: "completed",
            },
          ],
          error: null,
        },
        { data: [], error: null },
      ],
    });

    const result = await updateCallSessionTwilioStatus({
      supabase: supabaseState.supabase,
      callId: "call-2",
      twilioStatus: "completed",
    });

    expect(result).toMatchObject({
      applied: true,
      currentStatus: "completed",
      reason: "applied",
    });
  });
});
