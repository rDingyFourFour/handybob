import { describe, expect, it, vi } from "vitest";

import { sendCustomerSms } from "@/lib/domain/sms";

vi.mock("@/utils/communications/logMessage", () => ({
  logMessage: vi.fn(async () => ({ ok: true, messageId: "mock-id" })),
}));

describe("sendCustomerSms", () => {
  it("returns ok when Twilio is not configured", async () => {
    const supabaseMock = {
      from: () => ({
        insert: async () => ({ error: null }),
      }),
    };

    const result = await sendCustomerSms({
      supabase: supabaseMock,
      workspaceId: "ws_1",
      userId: "user_1",
      to: "+15555550123",
      body: "Test",
    });

    expect(result.ok).toBe(true);
    expect(result.sentAt).toBeDefined();
  });
});
