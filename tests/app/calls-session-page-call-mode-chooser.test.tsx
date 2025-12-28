import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CallSessionHub from "@/app/(app)/calls/[id]/CallSessionHub";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const baseModel = {
  workspaceId: "workspace-1",
  callId: "call-1",
  identity: {
    directionLabel: "Outbound call",
    isInbound: false,
    from: "+15550001111",
    to: "+15550002222",
    createdLabel: "Jan 1",
  },
  statusStripItems: [
    { key: "created", label: "Created", status: "Created", timestamp: "Now" },
    { key: "dial-requested", label: "Dial requested", status: "Not yet", timestamp: "—" },
  ],
  primaryCta: { kind: "disabled", label: "Select a call mode", disabled: true },
  primaryCtaExplanation: "Choose a call mode to continue.",
  ctaReasonCode: "select_call_mode",
  secondaryActions: { jobHref: "/jobs/job-1", callsHref: "/calls", messagesHref: null },
  callContext: {
    jobId: "job-1",
    customerId: "customer-1",
  },
  afterCallDraft: { body: null },
};

const automatedModel = {
  ...baseModel,
  primaryCta: {
    kind: "start-automated-call",
    label: "Start automated call",
    disabled: false,
    automatedCallPayload: null,
  },
  primaryCtaExplanation: "Ready to start the automated call.",
  ctaReasonCode: "start_automated_call",
};

const manualModel = {
  ...baseModel,
  primaryCta: {
    kind: "start-guided-call",
    label: "Start guided call",
    disabled: false,
    workspaceNavigate: { tab: "during", hash: "#manual-call-tools" },
  },
  primaryCtaExplanation: "Ready to start the guided call.",
  ctaReasonCode: "start_guided_call",
};

describe("CallSessionPage call mode chooser", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    window.sessionStorage.clear();
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
  });

  function renderHub(callId = "call-1") {
    return act(async () => {
      root?.render(
        <CallSessionHub
          callId={callId}
          workspaceId="workspace-1"
          jobId="job-1"
          customerId="customer-1"
          automatedModel={{ ...automatedModel, callId }}
          manualModel={{ ...manualModel, callId }}
          unselectedModel={{ ...baseModel, callId }}
          automatedWorkspace={<div />}
          manualWorkspace={<div />}
          automatedEligible
          manualEligible
          manualMessagesHref={null}
        />,
      );
      await Promise.resolve();
    });
  }

  function clickMode(mode: "automated" | "manual") {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-testid="call-mode-select-${mode}"]`,
    );
    if (!button) {
      return;
    }
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("renders the chooser with stable option wrappers when no mode is selected", async () => {
    await renderHub();
    const chooser = container.querySelector('[data-testid="call-mode-chooser-card"]');
    expect(chooser).toBeTruthy();
    const options = container.querySelectorAll('[data-testid^="call-mode-option-"]');
    expect(options).toHaveLength(2);
    const tags = Array.from(options).map((option) => option.tagName);
    expect(tags).toEqual(["DIV", "DIV"]);
  });

  it("selects automated mode, stores session selection, and shows one primary CTA", async () => {
    await renderHub();
    clickMode("automated");
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.sessionStorage.getItem("calls-session-mode:call-1")).toBe("automated");
    const primaryCtas = container.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
    expect(primaryCtas[0]?.textContent ?? "").toContain("Start automated call");
    const modeEvent = logSpy.mock.calls.find(
      (args) => args[0] === "[calls-session-mode-select]",
    );
    expect(modeEvent).toBeTruthy();
  });

  it("selects manual mode, stores session selection, and shows one primary CTA", async () => {
    await renderHub();
    clickMode("manual");
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.sessionStorage.getItem("calls-session-mode:call-1")).toBe("manual");
    const primaryCtas = container.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
    expect(primaryCtas[0]?.textContent ?? "").toContain("Start guided call");
    const modeEvent = logSpy.mock.calls.find(
      (args) => args[0] === "[calls-session-mode-select]",
    );
    expect(modeEvent).toBeTruthy();
  });

  it("hides the mode chooser after selecting a mode", async () => {
    await renderHub();
    clickMode("automated");
    await act(async () => {
      await Promise.resolve();
    });
    const primaryCtas = container.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
    expect(container.querySelector('[data-testid="call-mode-chooser-card"]')).toBeFalsy();
  });

  it("scopes session mode by callId", async () => {
    window.sessionStorage.setItem("calls-session-mode:call-1", "automated");
    await renderHub("call-2");
    expect(window.sessionStorage.getItem("calls-session-mode:call-2")).toBe(null);
    const primaryCtas = container.querySelectorAll('[data-cta-role="primary"]');
    expect(primaryCtas).toHaveLength(1);
    expect(primaryCtas[0]?.textContent ?? "").toContain("Select a call mode");
  });
});
