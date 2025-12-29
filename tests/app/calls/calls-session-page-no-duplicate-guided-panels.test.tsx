import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CallManualNumberCard from "@/app/(app)/calls/[id]/CallManualNumberCard";
import CallWorkspaceHost from "@/app/(app)/calls/[id]/CallWorkspaceHost";

describe("Call workspace dupes guard", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
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

  function renderWorkspace(mode: "automated" | "manual") {
    const automatedPanels = [{ id: "automated-tool", node: <div>Automated tools</div> }];
    const manualPanels = [
      {
        id: "manual-tools",
        node: (
          <CallManualNumberCard
            workspaceId="workspace-1"
            callId="call-1"
            jobId="job-1"
            customerId="customer-1"
            customerPhone="+15550001111"
            scriptSummary="Script summary"
          />
        ),
      },
    ];
    act(() => {
      root?.render(
        <CallWorkspaceHost
          mode={mode}
          workspaceId="workspace-1"
          callId="call-1"
          jobId="job-1"
          customerId="customer-1"
          automatedEligible
          manualEligible
          automatedPanels={automatedPanels}
          manualPanels={manualPanels}
          manualFallbackNode={<div>fallback</div>}
        />,
      );
    });
  }

  it("renders only one manual workspace when manual mode is active", () => {
    renderWorkspace("manual");
    expect(container.querySelectorAll('[data-testid="call-workspace-manual"]')).toHaveLength(1);
  });

  it("does not mount the manual workspace root when automated mode is active", () => {
    renderWorkspace("automated");
    expect(container.querySelector('[data-testid="call-workspace-manual"]')).toBeNull();
  });
});
