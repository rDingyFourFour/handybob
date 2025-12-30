import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSupabaseState,
  JOB_RECORD,
  mockGetJobAskBobHudSummary,
  mockGetJobAskBobSnapshotHistoryForJob,
  mockGetJobAskBobSnapshotsForJob,
  mockGetLatestCallOutcomeForJob,
  mockLoadCallHistoryForJob,
  mockResolveWorkspaceContext,
  renderJobDetailPage,
} from "@/tests/app/job-details/test-helpers";
import { resetNextHeadersUserAgent, setNextHeadersUserAgent } from "@/tests/setup/nextHeadersMock";

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15";

describe("Job Details headers async regression", () => {
  beforeEach(() => {
    setNextHeadersUserAgent(MOBILE_USER_AGENT);
    createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      appointments: { data: [], error: null },
      quotes: { data: [], error: null },
      invoices: { data: [], error: null },
    }).supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
    mockResolveWorkspaceContext.mockReset();
    mockGetJobAskBobHudSummary.mockReset();
    mockGetJobAskBobSnapshotsForJob.mockReset();
    mockGetJobAskBobSnapshotHistoryForJob.mockReset();
    mockLoadCallHistoryForJob.mockReset();
    mockGetLatestCallOutcomeForJob.mockReset();

    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: "workspace-1",
      userId: "user-1",
      membership: {
        user: { id: "user-1" },
        workspace: { id: "workspace-1" },
        role: "owner",
      },
    });
    mockGetJobAskBobHudSummary.mockResolvedValue({
      lastTaskLabel: null,
      lastUsedAt: null,
      totalRunsCount: 0,
      tasksSeen: [],
    });
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: null,
      afterCallSnapshot: null,
      postCallEnrichmentSnapshot: null,
    });
    mockGetJobAskBobSnapshotHistoryForJob.mockResolvedValue({
      diagnose: [],
      materials: [],
      quote: [],
    });
    mockLoadCallHistoryForJob.mockResolvedValue([]);
    mockGetLatestCallOutcomeForJob.mockResolvedValue(null);
  });

  afterEach(() => {
    resetNextHeadersUserAgent();
  });

  it("awaits headers() without crashing and honors the mobile defaults", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const mobileMarkup = await renderJobDetailPage();
      const mobileContainer = document.createElement("div");
      mobileContainer.innerHTML = mobileMarkup;
      const primaryCtas = mobileContainer.querySelectorAll(
        `[data-testid="job-details-next-step-primary-cta"]`,
      );
      expect(primaryCtas).toHaveLength(1);
      const expandedRows = mobileContainer.querySelectorAll(
        `[data-testid$="-content"][aria-hidden="false"]`,
      );
      expect(expandedRows).toHaveLength(0);
      expect(mobileContainer.querySelector('[data-testid="job-details-askbob-summary-collapsed"]')).toBeTruthy();
      expect(mobileContainer.querySelector('[data-testid="job-details-secondary-more"]')).toBeTruthy();
      const mobileLog = logSpy.mock.calls.find(([name]) => name === "[job-details-mobile-primary-surface-render]");
      expect(mobileLog).toBeTruthy();
      const payload = mobileLog?.[1] as Record<string, unknown> | undefined;
      expect(payload).toEqual(
        expect.objectContaining({ isMobile: true, defaultOpenStepId: null }),
      );

      setNextHeadersUserAgent(DESKTOP_USER_AGENT);
      const desktopMarkup = await renderJobDetailPage();
      const desktopContainer = document.createElement("div");
      desktopContainer.innerHTML = desktopMarkup;
      expect(desktopContainer.querySelector("[data-testid=\"job-details-secondary-more\"]")).toBeNull();
      expect(desktopContainer.querySelector("[data-testid=\"job-details-secondary-content\"]")).toBeTruthy();

      const errorCalls = errorSpy.mock.calls.flatMap(([message]) =>
        typeof message === "string" ? [message] : [],
      );
      const containsHeadersError = errorCalls.some((message) =>
        message.includes("headers().get is not a function"),
      );
      expect(containsHeadersError).toBe(false);
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
