import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createAdminClientMock = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

let POST: typeof import("@/app/(app)/twilio/voice/inbound/route").POST;

function buildRequest(payload: Record<string, string | undefined>) {
  const normalizedPayload = { ...payload };
  const entries = Object.entries(normalizedPayload);
  const formData: FormData = {
    get: (key: string) => {
      const value = normalizedPayload[key];
      return typeof value === "string" ? value : null;
    },
    forEach(callback: (value: string, key: string) => void) {
      entries.forEach(([key, value]) => {
        if (typeof value === "string") {
          callback(value, key);
        }
      });
    },
  } as unknown as FormData;

  return {
    url: "https://app.test/twilio/voice/inbound",
    method: "POST",
    headers: new Headers({ "content-type": "application/x-www-form-urlencoded" }),
    formData: async () => formData,
  } as unknown as NextRequest;
}

describe("Twilio inbound voice route", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    const actualModule = await vi.importActual<
      typeof import("@/app/(app)/twilio/voice/inbound/route")
    >("@/app/(app)/twilio/voice/inbound/route");
    POST = actualModule.POST;
  });

  it("returns TwiML and logs when the To number has no workspace", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: { data: [], error: null },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(
      buildRequest({
        CallSid: "call-1",
        From: "+15550000001",
        To: "+15550000002",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<Response></Response>");
    expect(warnSpy).toHaveBeenCalledWith(
      "[twilio-inbound-call-unknown-workspace]",
      expect.objectContaining({
        callSid: "call-1",
        to: "+15550000002",
        from: "+15550000001",
      }),
    );
  });

  it("creates a new call session when the workspace is known", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            owner_id: "owner-1",
            business_phone: "+15550000002",
          },
        ],
        error: null,
      },
      customers: { data: null, error: null },
      calls: [
        { data: [], error: null },
        { data: [{ id: "call-123" }], error: null },
      ],
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await POST(
      buildRequest({
        CallSid: "call-1",
        From: "+15550000001",
        To: "+15550000002",
      }),
    );

    expect(response.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(
      "[twilio-inbound-call-received]",
      expect.objectContaining({
        workspaceId: "workspace-1",
        sessionId: "call-123",
        matchedCustomer: false,
      }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      "[twilio-inbound-call-customer-miss]",
      expect.objectContaining({
        workspaceId: "workspace-1",
        callSid: "call-1",
      }),
    );
  });

  it("reuses an existing session when the CallSid is repeated", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            owner_id: "owner-1",
            business_phone: "+15550000002",
          },
        ],
        error: null,
      },
      customers: { data: null, error: null },
      calls: { data: { id: "call-abc", customer_id: null }, error: null },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await POST(
      buildRequest({
        CallSid: "call-abc",
        From: "+15550000001",
        To: "+15550000002",
      }),
    );

    expect(supabaseState.queries.calls.insert).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[twilio-inbound-call-received]",
      expect.objectContaining({
        sessionId: "call-abc",
        workspaceId: "workspace-1",
      }),
    );
  });

  it("attaches a matching customer when the caller phone matches", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            owner_id: "owner-1",
            business_phone: "+15550000002",
          },
        ],
        error: null,
      },
      customers: { data: { id: "customer-1" }, error: null },
      calls: [
        { data: [], error: null },
        { data: [{ id: "call-999" }], error: null },
      ],
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await POST(
      buildRequest({
        CallSid: "call-2",
        From: "+15550000001",
        To: "+15550000002",
      }),
    );

    expect(supabaseState.queries.calls.insert.mock.calls[0][0]).toMatchObject({
      customer_id: "customer-1",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "[twilio-inbound-call-customer-match]",
      expect.objectContaining({
        customerId: "customer-1",
        workspaceId: "workspace-1",
      }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      "[twilio-inbound-call-received]",
      expect.objectContaining({
        matchedCustomer: true,
        sessionId: "call-999",
      }),
    );
  });
});
