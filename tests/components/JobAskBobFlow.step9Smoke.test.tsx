import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import JobAskBobFlow from "@/components/askbob/JobAskBobFlow";
import { openOrCreateCallSessionForJobAction } from "@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction";

vi.mock("@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction", () => ({
  openOrCreateCallSessionForJobAction: vi.fn(),
}));

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/components/askbob/AskBobCallAssistPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-call-assist" />,
}));

vi.mock("@/components/askbob/JobAskBobFollowupPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-followup" />,
}));

vi.mock("@/components/askbob/JobAskBobAfterCallPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-after-call" />,
}));

vi.mock("@/components/askbob/JobAskBobContainer", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-container" />,
}));

const mockOpenCallSessionAction = openOrCreateCallSessionForJobAction as unknown as Mock;

function findOpenCallSessionButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes("Open call session"),
  );
}

describe("JobAskBobFlow call session open", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockOpenCallSessionAction.mockReset?.();
    mockPush.mockReset();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
  });

  it("opens a call session and routes on success", async () => {
    mockOpenCallSessionAction.mockResolvedValueOnce({
      ok: true,
      callId: "call-123",
    });

    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          customerId="customer-1"
          customerDisplayName="Customer"
          customerPhoneNumber="+15550001234"
          jobDescription="desc"
          jobTitle="title"
          askBobLastTaskLabel={null}
          askBobLastUsedAtDisplay={null}
          askBobLastUsedAtIso={null}
          askBobRunsSummary={null}
          initialLastQuoteId={null}
          lastQuoteCreatedAt={null}
          lastQuoteCreatedAtFriendly={null}
          initialDiagnoseSnapshot={null}
          initialMaterialsSnapshot={null}
          initialQuoteSnapshot={null}
          initialFollowupSnapshot={null}
          lastQuoteSummary={null}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain("Step 9 · AskBob automated call");
    const button = findOpenCallSessionButton(container);
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockOpenCallSessionAction).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/calls/call-123");
  });

  it("surfaces a failure message when the action fails", async () => {
    mockOpenCallSessionAction.mockResolvedValueOnce({
      ok: false,
      code: "job_not_found",
      message: "We couldn’t find that job.",
    });

    await act(async () => {
      root?.render(
        <JobAskBobFlow
          workspaceId="workspace-1"
          userId="user-1"
          jobId="job-1"
          customerId="customer-1"
          customerDisplayName="Customer"
          customerPhoneNumber="+15550001234"
          jobDescription="desc"
          jobTitle="title"
          askBobLastTaskLabel={null}
          askBobLastUsedAtDisplay={null}
          askBobLastUsedAtIso={null}
          askBobRunsSummary={null}
          initialLastQuoteId={null}
          lastQuoteCreatedAt={null}
          lastQuoteCreatedAtFriendly={null}
          initialDiagnoseSnapshot={null}
          initialMaterialsSnapshot={null}
          initialQuoteSnapshot={null}
          initialFollowupSnapshot={null}
          lastQuoteSummary={null}
        />,
      );
      await Promise.resolve();
    });

    const button = findOpenCallSessionButton(container);
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("We couldn’t find that job.");
  });
});
