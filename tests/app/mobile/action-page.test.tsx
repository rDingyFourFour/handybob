import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { readTrackedLinkButtonEventPayload } from "@/tests/app/mobile/test-helpers";
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

  it("renders a confirmation CTA for External.* scenarios", async () => {
    const container = await renderPage({
      scenario: "External.msg.notification.delay",
      jobId: "job-action",
      workspaceId: "workspace-action",
    });

    const confirmButton = container.querySelector('[data-testid="mobile-action-confirm"]');
    expect(confirmButton).toBeTruthy();
    expect(confirmButton?.getAttribute("href")).toBe(
      "/m?handoff=1&confirmed=1&jobId=job-action&scenario=External.msg.notification.delay",
    );

    const { payload } = readTrackedLinkButtonEventPayload(container, "mobile-action-confirm");
    expect(payload).toEqual({
      jobId: "job-action",
      workspaceId: "workspace-action",
      scenario: "External.msg.notification.delay",
      confirmed: true,
    });
  });
});
