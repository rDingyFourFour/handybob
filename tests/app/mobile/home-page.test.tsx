import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  createSupabaseState,
  mockGetCurrentWorkspace,
} from "@/tests/app/mobile/test-helpers";
import MobileHomePage from "@/app/m/page";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

describe("Mobile home page", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockGetCurrentWorkspace.mockReset();
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      workspace: { id: "workspace-1", name: "Test", owner_id: "owner-1" },
      role: "owner",
    });
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders a recommendation card with one primary CTA and logs render telemetry", async () => {
    const supabaseState = createSupabaseState({
      jobs: {
        data: [
          {
            id: "job-followup",
            title: "Follow-up job",
            status: "open",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      },
      askbob_job_task_snapshots: {
        data: [
          {
            job_id: "job-followup",
            task: "job.followup",
            payload: {
              recommendedAction: "Follow up with the customer",
              rationale: "Check in on the quote.",
              steps: [],
              shouldSendMessage: true,
              shouldScheduleVisit: false,
              shouldCall: false,
              shouldWait: false,
              modelLatencyMs: 1,
            },
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      },
      quotes: {
        data: [
          {
            id: "quote-1",
            job_id: "job-followup",
            status: "accepted",
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "owner@example.com", user_metadata: {} } },
      }),
    };

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const element = await MobileHomePage();

    act(() => {
      root?.render(element);
    });

    const ctaButtons = container.querySelectorAll('[data-testid="mobile-home-primary-cta"]');
    expect(ctaButtons).toHaveLength(1);
    const idleCard = container.querySelector('[data-testid="mobile-home-idle-card"]');
    expect(idleCard?.textContent).toContain(mobileFlowCopy.home.idleReassurance);
    expect(logSpy).toHaveBeenCalledWith(
      "[home-render]",
      expect.objectContaining({
        hasRecommendation: true,
      }),
    );
  });

  it("renders only the idle reassurance when no recommendation exists", async () => {
    const supabaseState = createSupabaseState({
      jobs: { data: [], error: null },
      askbob_job_task_snapshots: { data: [], error: null },
      quotes: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "owner@example.com", user_metadata: {} } },
      }),
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const element = await MobileHomePage();

    act(() => {
      root?.render(element);
    });

    const ctaButton = container.querySelector('[data-testid="mobile-home-primary-cta"]');
    expect(ctaButton).toBeNull();
    const idleCard = container.querySelector('[data-testid="mobile-home-idle-card"]');
    expect(idleCard?.textContent).toContain(mobileFlowCopy.home.idleReassurance);
    expect(logSpy).toHaveBeenCalledWith(
      "[home-render]",
      expect.objectContaining({
        hasRecommendation: false,
      }),
    );
  });
});
