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

import { acceptQuoteAction } from "@/app/(app)/quotes/actions/acceptQuoteAction";

const QUOTE_ROW = {
  id: "quote-1",
  workspace_id: "workspace-1",
  user_id: "user-1",
  job_id: "job-1",
  status: "draft",
  accepted_at: null,
};

describe("acceptQuoteAction", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
    createServerClientMock.mockReset();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockReset();
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("accepts a quote and logs telemetry", async () => {
    supabaseState.responses.quotes = [
      { data: [QUOTE_ROW], error: null },
      { data: [], error: null },
      { data: [{ id: "quote-1", job_id: "job-1", status: "accepted" }], error: null },
    ];

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("quoteId", "quote-1");

    const result = await acceptQuoteAction(null, formData);

    expect(result.ok).toBe(true);
    expect(result.code).toBe("accepted");

    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[quotes-accept-action-request]" &&
          payload.workspaceId === "workspace-1" &&
          payload.quoteId === "quote-1" &&
          payload.jobId === "job-1",
      ),
    ).toBe(true);
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[quotes-accept-action-success]" &&
          payload.workspaceId === "workspace-1" &&
          payload.quoteId === "quote-1" &&
          payload.jobId === "job-1" &&
          payload.code === "accepted",
      ),
    ).toBe(true);
  });

  it("rejects cross-workspace requests", async () => {
    const formData = new FormData();
    formData.append("workspaceId", "workspace-2");
    formData.append("quoteId", "quote-1");

    const result = await acceptQuoteAction(null, formData);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("unauthorized");

    const errorCalls = vi.mocked(console.error).mock.calls;
    expect(
      errorCalls.some(
        ([label, payload]) =>
          label === "[quotes-accept-action-failure]" && payload.reason === "unauthorized",
      ),
    ).toBe(true);
  });

  it("returns already_accepted when the quote is accepted", async () => {
    supabaseState.responses.quotes = {
      data: [{ ...QUOTE_ROW, status: "accepted" }],
      error: null,
    };

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("quoteId", "quote-1");

    const result = await acceptQuoteAction(null, formData);

    expect(result.ok).toBe(true);
    expect(result.code).toBe("already_accepted");

    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[quotes-accept-action-success]" && payload.code === "already_accepted",
      ),
    ).toBe(true);
  });

  it("blocks acceptance when another quote is accepted for the job", async () => {
    supabaseState.responses.quotes = [
      { data: [QUOTE_ROW], error: null },
      { data: [{ id: "quote-2", job_id: "job-1", status: "accepted" }], error: null },
    ];

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("quoteId", "quote-1");

    const result = await acceptQuoteAction(null, formData);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("accepted_conflict");

    const errorCalls = vi.mocked(console.error).mock.calls;
    expect(
      errorCalls.some(
        ([label, payload]) =>
          label === "[quotes-accept-action-failure]" && payload.reason === "accepted_conflict",
      ),
    ).toBe(true);
  });
});
