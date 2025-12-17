import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import * as callSessionsModule from "@/lib/domain/calls/sessions";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockDialTwilioCall = vi.fn();
const mockParseEnvConfig = vi.fn();
const setDialResultSpy = vi.spyOn(callSessionsModule, "setTwilioDialResultForCallSession");
const markDialRequestedSpy = vi.spyOn(callSessionsModule, "markCallSessionDialRequested");

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
    setDialResultSpy.mockReset();
    setDialResultSpy.mockResolvedValue(undefined);
    markDialRequestedSpy.mockReset();
    markDialRequestedSpy.mockResolvedValue({
      outcome: "allowed_to_dial",
      callId: "call-123",
    });
    mockParseEnvConfig.mockReturnValue({
      appUrl: "https://app.test",
      twilioAccountSid: null,
      twilioAuthToken: null,
      twilioMachineDetectionEnabled: false,
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
      calls: [
        { data: [], error: null },
        {
          data: [
            {
              id: "call-123",
              workspace_id: "workspace-1",
              job_id: "job-1",
            },
          ],
          error: null,
        },
      ],
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
      scriptBody: "Hello there",
      scriptSummary: "Follow-up script",
    });

    expect(result).toEqual({
      status: "success",
      code: "call_started",
      message: "Follow-up script",
      label: "Follow-up script",
      callId: "call-123",
      twilioStatus: "queued",
      twilioCallSid: "twilio-abc",
    });
    expect(supabaseState.queries.calls.insert).toHaveBeenCalled();
    expect(markDialRequestedSpy).toHaveBeenCalledTimes(1);
    expect(markDialRequestedSpy.mock.calls[0][0]).toMatchObject({
      callId: "call-123",
      workspaceId: "workspace-1",
    });
    expect(setDialResultSpy).toHaveBeenCalledTimes(1);
    expect(setDialResultSpy.mock.calls[0][0]).toMatchObject({
      callId: "call-123",
      workspaceId: "workspace-1",
      twilioStatus: "initiated",
      twilioCallSid: "twilio-abc",
    });
    expect(mockDialTwilioCall).toHaveBeenCalledWith(
      expect.objectContaining({
        recordCall: true,
        recordingCallbackUrl: "https://app.test/api/twilio/calls/recording",
      }),
    );
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
      calls: [
        { data: [], error: null },
        {
          data: [
            {
              id: "call-123",
              workspace_id: "workspace-1",
              job_id: "job-1",
            },
          ],
          error: null,
        },
      ],
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
      scriptBody: "Hello there",
      scriptSummary: "Follow-up script",
    });

    expect(result).toEqual({
      status: "failure",
      code: "twilio_not_configured",
      message: "Calls aren’t configured yet; please set up telephony to continue.",
      callId: "call-123",
      twilioStatus: "failed",
    });
    expect(markDialRequestedSpy).toHaveBeenCalledTimes(1);
    expect(setDialResultSpy).toHaveBeenCalledTimes(1);
    expect(setDialResultSpy.mock.calls[0][0]).toMatchObject({
      callId: "call-123",
      workspaceId: "workspace-1",
      twilioStatus: "failed",
      errorMessage: "Missing config",
    });
  });

  it.each(["queued", "initiated", "ringing"])(
    "reuses the existing session when the call status is %s",
    async (status) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
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
                id: "call-in-progress",
                workspace_id: "workspace-1",
                job_id: "job-1",
                twilio_call_sid: "twilio-abc",
                twilio_status: status,
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

        const result = await startAskBobAutomatedCall({
          workspaceId: "workspace-1",
          jobId: "job-1",
          customerId: "customer-1",
          customerPhone: "+15550002222",
          scriptBody: "Hello there",
          scriptSummary: "Follow-up script",
        });

        expect(result).toEqual({
          status: "already_in_progress",
          code: "already_in_progress",
          message: "Call is already in progress. Open call session.",
          callId: "call-in-progress",
          twilioStatus: status,
          twilioCallSid: "twilio-abc",
        });
        expect(markDialRequestedSpy).not.toHaveBeenCalled();
        expect(mockDialTwilioCall).not.toHaveBeenCalled();
        expect(setDialResultSpy).not.toHaveBeenCalled();
        expect(
          logSpy.mock.calls.some(
            (args) =>
              args[0] === "[askbob-automated-call-action-reused_existing_session]" &&
              args[1]?.callId === "call-in-progress" &&
              args[1]?.twilioStatus === status,
          ),
        ).toBe(true);
      } finally {
        logSpy.mockRestore();
      }
    },
  );

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
      scriptBody: "Hello there",
      scriptSummary: "Follow-up script",
    });

    expect(result).toEqual({
      status: "failure",
      code: "missing_customer_phone",
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
      scriptBody: "Hello there",
      scriptSummary: "Follow-up script",
    });

    expect(result).toEqual({
      status: "failure",
      code: "wrong_workspace",
      message: "This job does not belong to your workspace.",
    });
  });

  it("creates a fresh session when the previous call failed", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
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
        calls: [
          {
            data: [
              {
                id: "call-previous",
                workspace_id: "workspace-1",
                job_id: "job-1",
                twilio_status: "failed",
              },
            ],
            error: null,
          },
          {
            data: [
              {
                id: "call-123",
                workspace_id: "workspace-1",
                job_id: "job-1",
              },
            ],
            error: null,
          },
        ],
      });
      supabaseState.supabase.auth = {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
      };
      createServerClientMock.mockReturnValue(supabaseState.supabase);
      mockGetCurrentWorkspace.mockResolvedValue({ workspace: { id: "workspace-1" } });
      mockDialTwilioCall.mockResolvedValueOnce({
        success: true,
        twilioCallSid: "twilio-xyz",
        initialStatus: "queued",
      });

      const result = await startAskBobAutomatedCall({
        workspaceId: "workspace-1",
        jobId: "job-1",
        customerId: "customer-1",
        customerPhone: "+15550002222",
        scriptBody: "Hello there",
        scriptSummary: "Follow-up script",
      });

      expect(result.status).toBe("success");
      expect(result.code).toBe("call_started");
      expect(mockDialTwilioCall).toHaveBeenCalledTimes(1);
      expect(markDialRequestedSpy).toHaveBeenCalledTimes(1);
      expect(setDialResultSpy).toHaveBeenCalledTimes(1);
      expect(
        logSpy.mock.calls.some(
          (args) => args[0] === "[askbob-automated-call-action-created_new_session_after_failure]",
        ),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("rejects new dials when the previous call completed", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
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
              id: "call-existing",
              workspace_id: "workspace-1",
              job_id: "job-1",
              twilio_call_sid: "twilio-abc",
              twilio_status: "completed",
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

      const result = await startAskBobAutomatedCall({
        workspaceId: "workspace-1",
        jobId: "job-1",
        customerId: "customer-1",
        customerPhone: "+15550002222",
        scriptBody: "Hello there",
        scriptSummary: "Follow-up script",
      });

      expect(result).toEqual({
        status: "failure",
        code: "rejected_due_to_completed_call",
        message:
          "The automated call for this job already completed. Reach out if you need to place another one.",
        callId: "call-existing",
        twilioStatus: "completed",
        twilioCallSid: "twilio-abc",
      });
      expect(mockDialTwilioCall).not.toHaveBeenCalled();
      expect(
        logSpy.mock.calls.some((args) => args[0] === "[askbob-automated-call-action-rejected_due_to_completed_call]"),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });
});
