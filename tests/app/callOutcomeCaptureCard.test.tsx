import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CALL_OUTCOME_SCHEMA_OUT_OF_DATE_MESSAGE } from "@/utils/calls/callOutcomeMessages";
import type { SaveCallOutcomeResponse } from "@/app/(app)/calls/actions/saveCallOutcome";
import CallOutcomeCaptureCard from "@/app/(app)/calls/[id]/CallOutcomeCaptureCard";

// Manual smoke checklist:
// 1. On a real call session page, expand the outcome capture card and choose a reached/no-answer option.
// 2. Select a valid outcome code, add optional notes, save, and wait for the confirmation toast.
// 3. Refresh or revisit the call row and verify "Outcome: …" and "Reached: …" appear in recent activity/timeline.

describe("CallOutcomeCaptureCard prefill behavior", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  function renderCard(
    callId = "call-prefill",
  options?: {
    actionStateOverride?: [
      SaveCallOutcomeResponse | null,
      (formData: FormData | null | undefined) => unknown,
      boolean,
    ];
  },
  ) {
    if (!root) {
      throw new Error("missing root");
    }
    act(() => {
      root?.render(
        <CallOutcomeCaptureCard
          callId={callId}
          workspaceId="workspace-1"
          initialOutcomeCode={null}
          initialReachedCustomer={null}
          initialNotes={null}
          initialRecordedAt={null}
          hasAskBobScriptHint={false}
          {...(options ?? {})}
        />,
      );
    });
  }

  async function flushReactUpdates(iterations = 5) {
    await act(async () => {
      await Promise.resolve();
    });
    for (let i = 0; i < iterations; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("does not use cache when the outcome is already recorded", async () => {
    window.sessionStorage.setItem(
      "askbob-call-outcome-prefill-call-prefill-existing",
      JSON.stringify({ outcomeCode: "reached_needs_followup" }),
    );

    if (!root) {
      throw new Error("missing root");
    }
    act(() => {
      root?.render(
        <CallOutcomeCaptureCard
          callId="call-prefill-existing"
          workspaceId="workspace-1"
          initialOutcomeCode="reached_needs_followup"
          initialReachedCustomer={true}
          initialNotes="Existing outcome"
          initialRecordedAt={new Date().toISOString()}
          hasAskBobScriptHint={false}
        />,
      );
    });
    await flushReactUpdates();

    const markup = container.innerHTML;
    expect(markup).toContain("Outcome recorded");
    expect(
      window.sessionStorage.getItem("askbob-call-outcome-prefill-call-prefill-existing"),
    ).not.toBe(null);
  });

  it("prefills from cache once and clears the entry", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    window.sessionStorage.setItem(
      "askbob-call-outcome-prefill-call-prefill-hit",
      JSON.stringify({
        outcomeCode: "reached_needs_followup",
        reachedCustomer: true,
        notes: "Follow up soon",
      }),
    );

    renderCard("call-prefill-hit");
    await flushReactUpdates();

    const select = container.querySelector<HTMLSelectElement>("select[name='outcomeCode']");
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea[name='notes']");
    const selectedOption =
      select?.querySelector<HTMLOptionElement>("option[selected]") ??
      select?.options[select?.selectedIndex ?? 0];
    const selectedValue = selectedOption?.value ?? "";
    expect(selectedValue).toBe("reached_needs_followup");
    expect(textarea?.dataset.editingNotes ?? "").toBe("Follow up soon");
    expect(
      window.sessionStorage.getItem("askbob-call-outcome-prefill-call-prefill-hit"),
    ).toBeNull();
    expect(spy).toHaveBeenCalledWith("[calls-outcome-prefill-cache-hit]", {
      callId: "call-prefill-hit",
    });
  });

  it("logs cache miss and leaves the form blank when no data exists", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderCard("call-prefill-miss");
    await flushReactUpdates();

    const select = container.querySelector<HTMLSelectElement>("select[name='outcomeCode']");
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea[name='notes']");
    const selectedOption =
      select?.querySelector<HTMLOptionElement>("option[selected]") ??
      select?.options[select?.selectedIndex ?? 0];
    const selectedValue = selectedOption?.value ?? "";
    expect(selectedValue).toBe("");
    expect(textarea?.dataset.editingNotes ?? "").toBe("");
    expect(spy).toHaveBeenCalledWith("[calls-outcome-prefill-cache-miss]", {
      callId: "call-prefill-miss",
    });
  });

  it("transitions to recorded view after a successful save", async () => {
    const successResponse: SaveCallOutcomeResponse = {
      ok: true,
      callId: "call-save",
      reachedCustomer: true,
      outcomeCode: "reached_scheduled",
      notes: "Followed up",
      recordedAtIso: "2025-01-01T12:00:00Z",
    };
    renderCard("call-save", { actionStateOverride: [null, async () => {}, false] });
    await flushReactUpdates();

    expect(container.textContent).not.toContain("Outcome recorded");

    act(() => {
      root?.render(
        <CallOutcomeCaptureCard
          callId="call-save"
          workspaceId="workspace-1"
          initialOutcomeCode={null}
          initialReachedCustomer={null}
          initialNotes={null}
          initialRecordedAt={null}
          hasAskBobScriptHint={false}
          actionStateOverride={[successResponse, async () => {}, false]}
        />,
      );
    });

    await flushReactUpdates();

    expect(container.textContent).toContain("Outcome recorded");
    expect(container.textContent).toContain("Saved just now");
    expect(container.textContent).toContain("Outcome: Reached · Scheduled");
  });

  it("runs the form action with the expected FormData and shows the recorded state", async () => {
    const successResponse: SaveCallOutcomeResponse = {
      ok: true,
      callId: "call-integration",
      reachedCustomer: true,
      outcomeCode: "reached_needs_followup",
      notes: "Followed up in detail",
      recordedAtIso: "2025-01-01T12:00:00Z",
    };
    const formAction = vi.fn(async (formData: FormData | null | undefined) => {
      expect(formData).toBeInstanceOf(FormData);
      return successResponse;
    });

    renderCard("call-integration", { actionStateOverride: [null, formAction, false] });
    await flushReactUpdates();

    const reachedButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Reached",
    );
    act(() => {
      reachedButton?.click();
    });
    await flushReactUpdates();

    const select = container.querySelector<HTMLSelectElement>("select[name='outcomeCode']");
    act(() => {
      if (select) {
        select.value = "reached_needs_followup";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await flushReactUpdates();
    expect(select?.value).toBe("reached_needs_followup");

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea[name='notes']");
    act(() => {
      if (textarea) {
        textarea.value = "Followed up in detail";
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await flushReactUpdates();
    expect(textarea?.value).toBe("Followed up in detail");

    const formElement = container.querySelector<HTMLFormElement>("form");
    expect(formElement).toBeTruthy();
    const callIdInput = formElement!.querySelector<HTMLInputElement>("input[name='callId']");
    expect(callIdInput?.value).toBe("call-integration");
    const workspaceIdInput = formElement!.querySelector<HTMLInputElement>("input[name='workspaceId']");
    expect(workspaceIdInput?.value).toBe("workspace-1");
    const reachedCustomerInput = formElement!.querySelector<HTMLInputElement>(
      "input[name='reachedCustomer']",
    );
    expect(reachedCustomerInput?.value).toBe("true");
    await act(async () => {
      await formAction(new FormData(formElement!));
    });
    expect(formAction).toHaveBeenCalledTimes(1);

    act(() => {
      root?.render(
        <CallOutcomeCaptureCard
          callId="call-integration"
          workspaceId="workspace-1"
          initialOutcomeCode={null}
          initialReachedCustomer={null}
          initialNotes={null}
          initialRecordedAt={null}
          hasAskBobScriptHint={false}
          actionStateOverride={[successResponse, formAction, false]}
        />,
      );
    });
    await flushReactUpdates();

    expect(container.textContent).toContain("Outcome recorded");
    expect(container.textContent).toContain("Saved just now");
    expect(container.textContent).toContain("Outcome: Reached · Needs follow-up");
  });

  it("shows the schema-out-of-date prompt when the action fails with schema_out_of_date", async () => {
    const failureResponse: SaveCallOutcomeResponse = {
      ok: false,
      error: "Unable to save outcome",
      code: "schema_out_of_date",
    };
    const formAction = vi.fn(async () => failureResponse);
    renderCard("call-schema", { actionStateOverride: [null, formAction, false] });
    await flushReactUpdates();

    act(() => {
      root?.render(
        <CallOutcomeCaptureCard
          callId="call-schema"
          workspaceId="workspace-1"
          initialOutcomeCode={null}
          initialReachedCustomer={null}
          initialNotes={null}
          initialRecordedAt={null}
          hasAskBobScriptHint={false}
          actionStateOverride={[failureResponse, formAction, false]}
        />,
      );
    });
    await flushReactUpdates();

    expect(container.textContent).toContain(
      CALL_OUTCOME_SCHEMA_OUT_OF_DATE_MESSAGE,
    );
  });
});
