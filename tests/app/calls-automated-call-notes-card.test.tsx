import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import AutomatedCallNotesCard from "@/app/(app)/calls/[id]/AutomatedCallNotesCard";
import { saveAutomatedCallNotesAction } from "@/app/(app)/calls/actions/saveAutomatedCallNotesAction";

vi.mock("@/app/(app)/calls/actions/saveAutomatedCallNotesAction", () => ({
  saveAutomatedCallNotesAction: vi.fn(),
}));

const mockSaveAutomatedCallNotesAction = saveAutomatedCallNotesAction as unknown as ReturnType<
  typeof vi.fn
>;

describe("AutomatedCallNotesCard", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockSaveAutomatedCallNotesAction.mockReset();
    consoleLogSpy = vi.spyOn(console, "log");
    consoleWarnSpy = vi.spyOn(console, "warn");
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.useRealTimers();
  });

  it("autosaves notes with throttling and emits telemetry", async () => {
    vi.useFakeTimers();
    mockSaveAutomatedCallNotesAction.mockResolvedValue({
      ok: true,
      callId: "call-1",
      notes: "Saved note",
    });

    await act(async () => {
      root?.render(
        <AutomatedCallNotesCard workspaceId="workspace-1" callId="call-1" initialNotes="Initial note" />,
      );
      await Promise.resolve();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) {
      throw new Error("Textarea not found");
    }

    const dispatchNotesChange = (value: string) => {
      const reactPropsKey = Object.keys(textarea).find((key) => key.startsWith("__reactProps"));
      const handler =
        reactPropsKey &&
        ((textarea as Record<string, unknown>)[reactPropsKey] as { onChange?: unknown })?.onChange;
      if (!handler || typeof handler !== "function") {
        throw new Error("React change handler missing");
      }
      textarea.value = value;
      handler({ target: textarea, currentTarget: textarea });
    };

    await act(async () => {
      dispatchNotesChange("First note");
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSaveAutomatedCallNotesAction).toHaveBeenCalledTimes(1);
    expect(mockSaveAutomatedCallNotesAction).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      callId: "call-1",
      notes: "First note",
    });
    expect(container.textContent).toContain("Saved");

    const requestLogs = consoleLogSpy.mock.calls.filter(
      (args) => args[0] === "[calls-session-askbob-automated-notes-save-request]",
    );
    const successLogs = consoleLogSpy.mock.calls.filter(
      (args) => args[0] === "[calls-session-askbob-automated-notes-save-success]",
    );
    expect(requestLogs).toHaveLength(1);
    expect(successLogs).toHaveLength(1);

    await act(async () => {
      dispatchNotesChange("Second note");
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSaveAutomatedCallNotesAction).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Saved");
  });

  it("displays failure state and logs telemetry when save fails", async () => {
    vi.useFakeTimers();
    mockSaveAutomatedCallNotesAction.mockRejectedValueOnce(new Error("boom"));

    await act(async () => {
      root?.render(
        <AutomatedCallNotesCard workspaceId="workspace-1" callId="call-2" initialNotes="Existing" />,
      );
      await Promise.resolve();
    });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) {
      throw new Error("Textarea not found");
    }

    const reactPropsKey = Object.keys(textarea).find((key) => key.startsWith("__reactProps"));
    const handler =
      reactPropsKey &&
      ((textarea as Record<string, unknown>)[reactPropsKey] as { onChange?: unknown })?.onChange;
    if (!handler || typeof handler !== "function") {
      throw new Error("React change handler missing");
    }
    textarea.value = "Error note";
    handler({ target: textarea, currentTarget: textarea });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSaveAutomatedCallNotesAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Failed to save");

    const failureLogs = consoleWarnSpy.mock.calls.filter(
      (args) => args[0] === "[calls-session-askbob-automated-notes-save-failure]",
    );
    expect(failureLogs).toHaveLength(1);
  });
});
