import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

import CallsNewPage from "@/app/(app)/calls/new/page";

describe("CallsNewPage AskBob script integration", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock({
      jobs: {
        data: [
          {
            id: "job-1",
            title: "Test job",
            status: "open",
            customer_id: "customer-1",
            customers: { id: "customer-1", name: "Customer", phone: "+1555000000" },
          },
        ],
        error: null,
      },
      quotes: {
        data: [
          {
            id: "quote-1",
            total: 250,
            status: "sent",
          },
        ],
        error: null,
      },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
      role: "owner",
    });
  });

  it("prefills the script textarea, shows the AskBob hint, and logs the metric", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const element = await CallsNewPage({
      searchParams: Promise.resolve({
        jobId: "job-1",
        origin: "askbob-call-assist",
        scriptBody: "Call script from AskBob",
        scriptSummary: "Call requires follow-up",
      }),
    });

    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("This script was drafted by AskBob for this job.");
    expect(markup).toContain("Call script from AskBob");
    expect(markup).toContain("name=\"origin\"");
    const metricCall = logSpy.mock.calls.find(
      ([name]) => name === "[calls-compose-from-askbob-call-assist]",
    );
    expect(metricCall).toBeTruthy();
    expect(metricCall?.[1]).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
        jobId: "job-1",
        scriptLength: 23,
      }),
    );
    logSpy.mockRestore();
  });
});
