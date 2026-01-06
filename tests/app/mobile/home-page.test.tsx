import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  createSupabaseState,
  mockGetCurrentWorkspace,
  readTrackedLinkButtonEventPayload,
} from "@/tests/app/mobile/test-helpers";
import MobileHomePage from "@/app/m/page";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import { bobInstructionSentenceCopy } from "@/lib/domain/askbob/bobInstructionSentenceCopy";
import * as homeInstructionTelemetry from "@/app/m/homeInstructionTelemetry";

const PRIMARY_BUTTON_CLASS_TOKEN = "bg-[var(--theme-button-primary-bg)]";

const DIAGNOSE_SNAPSHOT = {
  sessionId: "home-diagnose",
  responseId: "home-response",
  createdAt: new Date().toISOString(),
  sections: [
    {
      type: "steps",
      title: "Steps",
      items: ["Home follow-up context"],
    },
  ],
};
const MATERIALS_SNAPSHOT = {
  items: [],
};

const findPrimaryStyledButtons = (root: HTMLElement) => {
  const ctas = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="mobile-home-primary-cta"]'));
  if (ctas.length > 0) {
    return ctas;
  }
  return Array.from(root.querySelectorAll<HTMLElement>("button, a")).filter((element) =>
    element.className.includes(PRIMARY_BUTTON_CLASS_TOKEN),
  );
};

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

  it("renders a single primary CTA with Bob's CTA copy", async () => {
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
            task: "job.diagnose",
            payload: DIAGNOSE_SNAPSHOT,
            updated_at: new Date().toISOString(),
          },
          {
            job_id: "job-followup",
            task: "materials.generate",
            payload: MATERIALS_SNAPSHOT,
            updated_at: new Date().toISOString(),
          },
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

    const telemetrySpy = vi.spyOn(
      homeInstructionTelemetry,
      "buildHomeInstructionTelemetryPayload",
    );
    const element = await MobileHomePage();

    act(() => {
      root?.render(element);
    });

    const ctaButtons = container.querySelectorAll('[data-testid="mobile-home-primary-cta"]');
    expect(ctaButtons).toHaveLength(1);
    const primaryCta = ctaButtons[0];
    expect(primaryCta?.textContent?.trim()).toBe(mobileFlowCopy.home.recommendationCtaLabel);
    expect(primaryCta?.textContent?.trim()).toBe("Send follow-up");
    const primaryCard = container.querySelector(
      '[data-testid="mobile-home-recommendation-card"]',
    );
    expect(primaryCard).toBeTruthy();
    const reassuranceCard = container.querySelector(
      '[data-testid="mobile-home-reassurance-card"]',
    );
    expect(reassuranceCard).toBeTruthy();
    expect(reassuranceCard?.textContent).toContain(mobileFlowCopy.home.idleReassurance);
    expect(primaryCard?.nextElementSibling).toBe(reassuranceCard);

    const mobileHomeRoot = container.querySelector(".mobile-home");
    const header = container.querySelector(".mobile-home-header");
    const stack = container.querySelector(".mobile-home-stack");
    expect(mobileHomeRoot).toBeTruthy();
    expect(header).toBeTruthy();
    expect(stack).toBeTruthy();

    const primaryButtons = findPrimaryStyledButtons(container);
    expect(primaryButtons).toHaveLength(1);

    const expectedInstructionTitle = "Send a follow-up for the Follow-up job";
    const titleElement = container.querySelector(".mobile-home-primary-card h2");
    expect(titleElement?.textContent).toContain(expectedInstructionTitle);
    const subcopyElement = container.querySelector(".mobile-home-instruction-subcopy");
    expect(subcopyElement?.textContent).toBe("The customer hasn't confirmed timing yet.");
    expect(primaryCta?.getAttribute("href")).toBe(
      "/m/follow-up?jobId=job-followup&workspaceId=workspace-1",
    );
    expect(container.textContent).not.toContain(bobInstructionSentenceCopy.followup_due);
    expect(telemetrySpy).toHaveBeenCalledTimes(1);
    const telemetryResult = telemetrySpy.mock.results[0]?.value as Record<string, unknown> | undefined;
    expect(telemetryResult).toEqual(
      expect.objectContaining({
        hasRecommendation: true,
        isMobile: true,
        stepType: expect.any(String),
      }),
    );
    expect(telemetryResult?.stepType).not.toBe("idle");
    if (telemetryResult?.nextStepType) {
      expect(typeof telemetryResult.nextStepType).toBe("string");
    }
    const { payload: ctaPayload, raw: ctaRaw } = readTrackedLinkButtonEventPayload(
      container,
      "mobile-home-primary-cta",
    );
    expect(ctaPayload).toEqual(telemetryResult);
    expect(ctaRaw).toBe(JSON.stringify(ctaPayload));
    const listElements = container.querySelectorAll("ul, ol, [role='list']");
    expect(listElements).toHaveLength(0);
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
    const telemetrySpy = vi.spyOn(
      homeInstructionTelemetry,
      "buildHomeInstructionTelemetryPayload",
    );
    const element = await MobileHomePage();

    act(() => {
      root?.render(element);
    });

    const ctaButton = container.querySelector('[data-testid="mobile-home-primary-cta"]');
    expect(ctaButton).toBeNull();
    const reassuranceCard = container.querySelector(
      '[data-testid="mobile-home-reassurance-card"]',
    );
    expect(reassuranceCard).toBeTruthy();
    expect(reassuranceCard?.textContent).toContain(mobileFlowCopy.home.idleReassurance);

    const header = container.querySelector(".mobile-home-header");
    expect(header).toBeTruthy();
    expect(container.querySelector(".mobile-home-stack")).toBeTruthy();
    expect(container.querySelector(".mobile-home-reassurance-card")).toBeTruthy();

    const primaryButtons = findPrimaryStyledButtons(container);
    expect(primaryButtons).toHaveLength(0);

    expect(telemetrySpy).toHaveBeenCalledTimes(1);
    const telemetryResult = telemetrySpy.mock.results[0]?.value as Record<string, unknown> | undefined;
    expect(telemetryResult).toEqual(
      expect.objectContaining({
        hasRecommendation: false,
        isMobile: true,
        stepType: "idle",
      }),
    );
    expect(telemetryResult?.nextStepType).toBeUndefined();
    const listElements = container.querySelectorAll("ul, ol, [role='list']");
    expect(listElements).toHaveLength(0);
  });

});
