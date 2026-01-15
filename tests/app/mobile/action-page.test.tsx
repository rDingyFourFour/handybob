import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { readTrackedLinkButtonEventPayload } from "@/tests/app/mobile/test-helpers";
import MobileActionExecutionPage from "@/app/m/action/page";
import { bobFlowScenarioList } from "@/lib/domain/bobflow/bobFlowScenario";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));

const renderPage = async (params: {
  scenario?: string;
  jobId?: string;
  workspaceId?: string;
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
  const externalScenarios = bobFlowScenarioList.filter((scenario) =>
    scenario.startsWith("External."),
  );

  it("renders every External.* scenario with deterministic CTAs", async () => {
    for (const scenario of externalScenarios) {
      const container = await renderPage({
        scenario,
        jobId: "job-action",
        workspaceId: "workspace-action",
      });

      const confirmButton = container.querySelector('[data-testid="mobile-action-confirm"]');
      expect(confirmButton).toBeTruthy();
      const confirmHref = confirmButton?.getAttribute("href") ?? "";
      const confirmParams = new URLSearchParams(confirmHref.split("?")[1] ?? "");
      expect(confirmParams.get("handoff")).toBe("1");
      expect(confirmParams.get("confirmed")).toBe("1");
      expect(confirmParams.get("executed")).toBe("0");
      expect(confirmParams.get("jobId")).toBe("job-action");
      expect(confirmParams.get("workspaceId")).toBe("workspace-action");
      expect(confirmParams.get("scenario")).toBe(scenario);

      const { payload: confirmPayload } = readTrackedLinkButtonEventPayload(
        container,
        "mobile-action-confirm",
      );
      expect(confirmPayload).toEqual({
        jobId: "job-action",
        workspaceId: "workspace-action",
        scenario,
        confirmed: true,
      });

      const primaryButton = container.querySelector('[data-testid="mobile-action-primary"]');
      expect(primaryButton).toBeTruthy();
      const primaryHref = primaryButton?.getAttribute("href") ?? "";
      if (scenario.includes(".followup.")) {
        expect(primaryHref.startsWith("/m/follow-up")).toBe(true);
        const followupParams = new URLSearchParams(primaryHref.split("?")[1] ?? "");
        expect(followupParams.get("jobId")).toBe("job-action");
        expect(followupParams.get("workspaceId")).toBe("workspace-action");
        expect(followupParams.get("scenario")).toBe(scenario);
      } else {
        expect(primaryHref).toBe("/m/jobs/job-action");
      }

      const { payload: primaryPayload } = readTrackedLinkButtonEventPayload(
        container,
        "mobile-action-primary",
      );
      expect(primaryPayload).toEqual({
        jobId: "job-action",
        workspaceId: "workspace-action",
        scenario,
      });
    }
  });

  it("redirects to /m for internal scenarios", async () => {
    await expect(
      MobileActionExecutionPage({
        searchParams: Promise.resolve({
          scenario: "Internal.msg",
          jobId: "job-action",
          workspaceId: "workspace-action",
        }),
      }),
    ).rejects.toThrow("redirect");
  });

  it("redirects to /m for unknown scenarios", async () => {
    await expect(
      MobileActionExecutionPage({
        searchParams: Promise.resolve({
          scenario: "bogus",
          jobId: "job-action",
          workspaceId: "workspace-action",
        }),
      }),
    ).rejects.toThrow("redirect");
  });

  it("renders confirm CTA when jobId and workspaceId are missing", async () => {
    const container = await renderPage({
      scenario: "External.msg.notification.delay",
    });

    const confirmButton = container.querySelector('[data-testid="mobile-action-confirm"]');
    expect(confirmButton).toBeTruthy();
    const confirmHref = confirmButton?.getAttribute("href") ?? "";
    const confirmParams = new URLSearchParams(confirmHref.split("?")[1] ?? "");
    expect(confirmParams.get("handoff")).toBe("1");
    expect(confirmParams.get("confirmed")).toBe("1");
    expect(confirmParams.get("executed")).toBe("0");
    expect(confirmParams.get("jobId")).toBeNull();
    expect(confirmParams.get("workspaceId")).toBeNull();
    expect(confirmParams.get("scenario")).toBe("External.msg.notification.delay");

    const { payload: confirmPayload } = readTrackedLinkButtonEventPayload(
      container,
      "mobile-action-confirm",
    );
    expect(confirmPayload).toEqual({
      scenario: "External.msg.notification.delay",
      confirmed: true,
    });

    expect(container.querySelector('[data-testid="mobile-action-primary"]')).toBeNull();
  });
});
