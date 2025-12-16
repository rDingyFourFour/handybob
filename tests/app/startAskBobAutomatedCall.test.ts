import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import * as callSessionsModule from "@/lib/domain/calls/sessions";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockDialTwilioCall = vi.fn();
const mockParseEnvConfig = vi.fn();
const attachSpy = vi.spyOn(callSessionsModule, "attachTwilioMetadataToCallSession");
const updateSpy = vi.spyOn(callSessionsModule, "updateCallSessionTwilioStatus");

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

vi.mock("@/schemas/env", () => ({
  parseEnvConfig: () => mockParseEnvConfig(),
}));

vi.mock("@/lib/domain/twilio.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/twilio.server")>(
    "@/lib/domain/twilio.server",
  );
  return {
    __esModule: true,
    ...actual,
    dialTwilioCall: (...args: Parameters<typeof actual.dialTwilioCall>) => mockDialTwilioCall(...args),
  };
});

import { startAskBobAutomatedCall } from "@/app/(app)/calls/actions/startAskBobAutomatedCall";

describe("startAskBobAutomatedCall", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.TWILIO_ACCOUNT_SID = "sid";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15550000000";
    attachSpy.mockReset();
    attachSpy.mockResolvedValue(undefined);
    updateSpy.mockReset();
    updateSpy.mockResolvedValue(undefined);
    mockParseEnvConfig.mockReturnValue({
      appUrl: "https://app.test",
      twilioAccountSid: null,
      twilioAuthToken: null,
      stripeSecretKey: null,
      stripeWebhookSecret: null,
      openAiModel: "gpt-4.1-mini",
    });
  });

  it("creates a call session for a valid request", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: {
        data: [
          {
            id: "job-1",
            workspace_id: "workspace-1",
            customer_id: "customer-1",
          },
        ],
        error: null,
      },
      workspaces: {
        data: [
          {
            business_phone: "+15550001111",
          },
        ],
        error: null,
      },
      calls: {
        data: [
          {
            id: "call-123",
            workspace_id: "workspace-1",
            job_id: "job-1",
          },
        ],
        error: null,
      },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({ workspace: { id: "workspace-1" } });
    mockDialTwilioCall.mockResolvedValueOnce({
      success: true,
      twilioCallSid: "twilio-abc",
      initialStatus: "queued",
    });

    const result = await startAskBobAutomatedCall({
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerId: "customer-1",
      customerPhone: "+15550002222",
      scriptSummary: "Follow-up script",
    });

    expect(result).toEqual({
      status: "success",
      callId: "call-123",
      label: "Follow-up script",
      twilioStatus: "queued",
    });
    expect(supabaseState.queries.calls.insert).toHaveBeenCalled();
    expect(attachSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call-123",
        twilioCallSid: "twilio-abc",
        initialStatus: "queued",
      }),
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns a failure when Twilio is not configured", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: {
        data: [
          {
            id: "job-1",
            workspace_id: "workspace-1",
            customer_id: "customer-1",
          },
        ],
        error: null,
      },
      workspaces: {
        data: [
          {
            business_phone: "+15550001111",
          },
        ],
        error: null,
      },
      calls: {
        data: [
          {
            id: "call-123",
            workspace_id: "workspace-1",
            job_id: "job-1",
          },
        ],
        error: null,
      },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({ workspace: { id: "workspace-1" } });
    mockDialTwilioCall.mockResolvedValueOnce({
      success: false,
      code: "twilio_not_configured",
      message: "Missing config",
    });

    const result = await startAskBobAutomatedCall({
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerId: "customer-1",
      customerPhone: "+15550002222",
      scriptSummary: "Follow-up script",
    });

    expect(result).toEqual({
      status: "failure",
      reason: "twilio_not_configured",
      message: "Calls aren’t configured yet; please set up telephony to continue.",
      callId: "call-123",
    });
    expect(attachSpy).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call-123",
        twilioStatus: "failed",
        errorMessage: "Missing config",
      }),
    );
  });

  it("fails when the customer phone is missing", async () => {
    const supabaseState = setupSupabaseMock();
    supabaseState.supabase.auth = {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({ workspace: { id: "workspace-1" } });

    const result = await startAskBobAutomatedCall({
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerPhone: "   ",
      scriptSummary: "Follow-up script",
    });

    expect(result).toEqual({
      status: "failure",
      reason: "missing_customer_phone",
      message: "Add a customer phone number before placing an automated call.",
    });
    expect(supabaseState.queries.calls?.insert).toBeUndefined();
  });

  it("rejects cross-workspace jobs", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: {
        data: [
          {
            id: "job-1",
            workspace_id: "workspace-1",
            customer_id: "customer-1",
          },
        ],
        error: null,
      },
      workspaces: {
        data: [
          {
            business_phone: "+15550001111",
          },
        ],
        error: null,
      },
      calls: {
        data: [],
        error: null,
      },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({ workspace: { id: "workspace-2" } });

    const result = await startAskBobAutomatedCall({
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerPhone: "+15550002222",
      scriptSummary: "Follow-up script",
    });

    expect(result).toEqual({
      status: "failure",
      reason: "wrong_workspace",
      message: "This job does not belong to your workspace.",
    });
  });
});
