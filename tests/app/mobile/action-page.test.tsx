import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import MobileActionExecutionPage from "@/app/m/action/page";

describe("Mobile action execution page", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
  });

  it("renders the execution placeholder with scenario info and back link", async () => {
    const element = await MobileActionExecutionPage({
      searchParams: Promise.resolve({
        scenario: "External.msg.notification.delay",
        jobId: "job-action",
        workspaceId: "workspace-action",
        intent: "move_on",
      }),
    });

    act(() => root?.render(element));

    const rootElement = container.querySelector('[data-testid="mobile-action-root"]');
    expect(rootElement).toBeTruthy();
    const scenarioElement = container.querySelector('[data-testid="mobile-action-scenario"]');
    expect(scenarioElement?.textContent).toContain("External");
    const intentLabel = container.textContent;
    const backButton = container.querySelector('[data-testid="mobile-action-back"]');
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/m");
    expect(intentLabel).toContain("Intent: move_on");
  });
});
