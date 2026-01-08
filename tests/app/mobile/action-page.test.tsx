import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MobileActionExecutionPage from "@/app/m/action/page";

const renderPage = async (params: {
  scenario?: string;
  jobId?: string;
  workspaceId?: string;
  intent?: string;
}) => {
  const element = await MobileActionExecutionPage({
    searchParams: Promise.resolve(params),
  });
  const html = renderToStaticMarkup(element);
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
};

describe("Mobile action execution page", () => {
  it("renders the execution UI for valid Internal scenario with hidden inputs and submit", async () => {
    const container = await renderPage({
      scenario: "Internal.msg",
      jobId: "job-action",
      workspaceId: "workspace-action",
      intent: "move_on",
    });

    const runForm = container.querySelector('[data-testid="mobile-action-run-form"]');
    const runButton = container.querySelector('[data-testid="mobile-action-run-button"]');
    expect(runForm).toBeTruthy();
    expect(runButton).toBeTruthy();
    expect(runButton?.textContent).toBe("Run next step");
    expect(container.querySelector('[data-testid="mobile-action-error"]')).toBeNull();
    expect(container.querySelector('input[name="scenario"]')?.getAttribute("value")).toBe("Internal.msg");
    expect(container.querySelector('input[name="jobId"]')?.getAttribute("value")).toBe("job-action");
    expect(container.querySelector('input[name="workspaceId"]')?.getAttribute("value")).toBe("workspace-action");
    expect(container.querySelector('input[name="intent"]')?.getAttribute("value")).toBe("move_on");
    expect(container.textContent).toContain("Job ID: job-action");
  });

  it("renders an error when critical parameters are missing", async () => {
    const container = await renderPage({
      scenario: "Internal.msg",
      workspaceId: "workspace-action",
    });

    const errorCard = container.querySelector('[data-testid="mobile-action-error"]');
    expect(errorCard).toBeTruthy();
    expect(container.textContent).toContain("Job context missing");
    expect(container.querySelector('[data-testid="mobile-action-run-form"]')).toBeNull();
  });

  it("prompts the user when the scenario needs manual intervention", async () => {
    const container = await renderPage({
      scenario: "External.msg.notification.delay",
      jobId: "job-action",
      workspaceId: "workspace-action",
    });

    expect(container.querySelector('[data-testid="mobile-action-error"]')).toBeTruthy();
    expect(container.textContent).toContain("requires your intervention");
    expect(container.querySelector('[data-testid="mobile-action-run-form"]')).toBeNull();
  });
});
