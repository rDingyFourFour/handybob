import { FormData as NodeFormData } from "formdata-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

vi.mock("@/lib/domain/calls/sessions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/calls/sessions")>(
    "@/lib/domain/calls/sessions",
  );
  return {
    ...actual,
    linkCallToCustomerJob: vi.fn(),
  };
});

import { linkInboundCallToContextAction } from "@/app/(app)/calls/actions/linkInboundCallToContext";
import { linkCallToCustomerJob } from "@/lib/domain/calls/sessions";

const linkCallToCustomerJobMock = vi.mocked(linkCallToCustomerJob);

describe("linkInboundCallToContextAction", () => {
  let supabaseState = setupSupabaseMock();
  let consoleLogMock: ReturnType<typeof vi.spyOn>;
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    linkCallToCustomerJobMock.mockReset();
    consoleLogMock = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogMock.mockRestore();
    consoleErrorMock.mockRestore();
  });

  it("links an inbound call with job context", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-1",
          workspace_id: "workspace-1",
          direction: "inbound",
          job_id: "job-1",
          customer_id: "customer-1",
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = {
      data: [{ id: "customer-1", workspace_id: "workspace-1" }],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [{ id: "job-1", workspace_id: "workspace-1", customer_id: "customer-1" }],
      error: null,
    };

    linkCallToCustomerJobMock.mockResolvedValue({
      callId: "call-1",
      customerId: "customer-1",
      jobId: "job-1",
      direction: "inbound",
    });

    const formData = new NodeFormData();
    formData.set("workspaceId", "workspace-1");
    formData.set("callId", "call-1");
    formData.set("customerId", "customer-1");
    formData.set("jobId", "job-1");

    const result = await linkInboundCallToContextAction(formData);

    expect(result.success).toBe(true);
    expect(result.payload).toMatchObject({
      callId: "call-1",
      customerId: "customer-1",
      jobId: "job-1",
      direction: "inbound",
    });

    expect(linkCallToCustomerJobMock).toHaveBeenCalledWith({
      supabase: supabaseState.supabase,
      workspaceId: "workspace-1",
      callId: "call-1",
      customerId: "customer-1",
      jobId: "job-1",
    });

    expect(consoleLogMock).toHaveBeenCalledWith(
      "[calls-inbound-link-action-request]",
      expect.objectContaining({
        workspaceId: "workspace-1",
        callId: "call-1",
        customerId: "customer-1",
      }),
    );
    expect(consoleLogMock).toHaveBeenCalledWith(
      "[calls-inbound-link-action-success]",
      expect.objectContaining({
        workspaceId: "workspace-1",
        callId: "call-1",
      }),
    );
  });

  it("rejects calls that are not inbound", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-2",
          workspace_id: "workspace-1",
          direction: "outbound",
          customer_id: "customer-1",
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = {
      data: [{ id: "customer-1", workspace_id: "workspace-1" }],
      error: null,
    };

    const formData = new NodeFormData();
    formData.set("workspaceId", "workspace-1");
    formData.set("callId", "call-2");
    formData.set("customerId", "customer-1");

    const result = await linkInboundCallToContextAction(formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("not_inbound");
    expect(consoleErrorMock).toHaveBeenCalledWith(
      "[calls-inbound-link-action-failure] call not inbound",
      expect.objectContaining({
        callId: "call-2",
        direction: "outbound",
      }),
    );
  });

  it("rejects calls belonging to a different workspace", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-3",
          workspace_id: "workspace-2",
          direction: "inbound",
          customer_id: "customer-1",
        },
      ],
      error: null,
    };

    const formData = new NodeFormData();
    formData.set("workspaceId", "workspace-1");
    formData.set("callId", "call-3");
    formData.set("customerId", "customer-1");

    const result = await linkInboundCallToContextAction(formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("cross_workspace");
    expect(consoleErrorMock).toHaveBeenCalledWith(
      "[calls-inbound-link-action-failure] call cross workspace",
      expect.objectContaining({
        callId: "call-3",
        expectedWorkspaceId: "workspace-1",
      }),
    );
  });

  it("rejects when the selected job belongs to another customer", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-4",
          workspace_id: "workspace-1",
          direction: "inbound",
          customer_id: "customer-1",
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = {
      data: [{ id: "customer-1", workspace_id: "workspace-1" }],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [{ id: "job-2", workspace_id: "workspace-1", customer_id: "customer-2" }],
      error: null,
    };

    const formData = new NodeFormData();
    formData.set("workspaceId", "workspace-1");
    formData.set("callId", "call-4");
    formData.set("customerId", "customer-1");
    formData.set("jobId", "job-2");

    const result = await linkInboundCallToContextAction(formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("job_customer_mismatch");
  });

  it("rejects when customerId is missing", async () => {
    const formData = new NodeFormData();
    formData.set("workspaceId", "workspace-1");
    formData.set("callId", "call-5");

    const result = await linkInboundCallToContextAction(formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("invalid_form_data");
  });
});
