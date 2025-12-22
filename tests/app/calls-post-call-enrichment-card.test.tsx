import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRunAction = vi.fn();
const mockCacheDraft = vi.fn();
const mockCacheOutcome = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/app/(app)/askbob/call-post-enrichment-actions", () => ({
  runAskBobCallPostEnrichmentAction: (...args: unknown[]) => mockRunAction(...args),
}));

vi.mock("@/utils/askbob/messageDraftCache", () => ({
  cacheAskBobMessageDraft: (...args: unknown[]) => mockCacheDraft(...args),
}));

vi.mock("@/utils/askbob/callOutcomePrefillCache", () => ({
  cacheCallOutcomePrefill: (...args: unknown[]) => mockCacheOutcome(...args),
}));

import PostCallEnrichmentCard from "@/app/(app)/calls/[id]/PostCallEnrichmentCard";
import type { CallPostEnrichmentResult } from "@/lib/domain/askbob/types";

const baseResult: CallPostEnrichmentResult = {
  summaryParagraph: "Customer confirmed follow-up.",
  keyMoments: ["Confirmed appointment", "Shared estimate"],
  suggestedReachedCustomer: true,
  suggestedOutcomeCode: "reached_scheduled",
  outcomeRationale: "Customer agreed to schedule.",
  suggestedFollowupDraft: "Thanks for the call. We'll see you Tuesday.",
  riskFlags: ["Access requires ladder"],
  confidenceLabel: "high",
};

describe("PostCallEnrichmentCard", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockRunAction.mockReset();
    mockCacheDraft.mockReset();
    mockCacheOutcome.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  async function flushReactUpdates(iterations = 4) {
    await act(async () => {
      await Promise.resolve();
    });
    for (let i = 0; i < iterations; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  it("disables the CTA when the call is not terminal", async () => {
    act(() => {
      root?.render(
        <PostCallEnrichmentCard
          workspaceId="workspace-1"
          callId="call-1"
          jobId="job-1"
          customerId="customer-1"
          direction="outbound"
          isTerminal={false}
          hasRecordingMetadata={false}
          hasOutcome={false}
        />,
      );
    });
    await flushReactUpdates();

    const button = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Generate recap"),
    );
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  it("renders all result sections", async () => {
    act(() => {
      root?.render(
        <PostCallEnrichmentCard
          workspaceId="workspace-1"
          callId="call-2"
          jobId="job-2"
          customerId="customer-2"
          direction="inbound"
          isTerminal
          hasRecordingMetadata
          hasOutcome
          initialResult={baseResult}
        />,
      );
    });
    await flushReactUpdates();

    const text = container.textContent ?? "";
    expect(text).toContain("Summary");
    expect(text).toContain("Key moments");
    expect(text).toContain("Suggested outcome");
    expect(text).toContain("Suggested follow-up draft");
    expect(text).toContain("Risk flags");
    expect(text).toContain("Customer confirmed follow-up.");
  });

  it("writes the suggested outcome payload", async () => {
    act(() => {
      root?.render(
        <PostCallEnrichmentCard
          workspaceId="workspace-1"
          callId="call-3"
          jobId="job-3"
          customerId="customer-3"
          direction="outbound"
          isTerminal
          hasRecordingMetadata={false}
          hasOutcome={false}
          initialResult={baseResult}
        />,
      );
    });
    await flushReactUpdates();

    const applyButton = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Apply suggested outcome"),
    );
    act(() => {
      applyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockCacheOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call-3",
        workspaceId: "workspace-1",
        suggestedReachedCustomer: true,
        suggestedOutcomeCode: "reached_scheduled",
      }),
    );
  });

  it("opens the composer without draft body in the URL", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockCacheDraft.mockReturnValue("draft-1");

    act(() => {
      root?.render(
        <PostCallEnrichmentCard
          workspaceId="workspace-1"
          callId="call-4"
          jobId="job-4"
          customerId="customer-4"
          direction="outbound"
          isTerminal
          hasRecordingMetadata
          hasOutcome={false}
          initialResult={baseResult}
        />,
      );
    });
    await flushReactUpdates();

    const openButton = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Open composer"),
    );
    act(() => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockCacheDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "call_post_enrichment",
        jobId: "job-4",
        customerId: "customer-4",
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/messages?"),
    );
    const pushedUrl = mockPush.mock.calls[0]?.[0] ?? "";
    expect(pushedUrl).toContain("origin=call_post_enrichment");
    expect(pushedUrl).toContain("draftKey=draft-1");
    expect(pushedUrl).not.toContain("draftBody");
    expect(logSpy).toHaveBeenCalledWith(
      "[calls-after-call-open-composer-click]",
      expect.objectContaining({ draftSource: "call_post_enrichment" }),
    );
  });
});
