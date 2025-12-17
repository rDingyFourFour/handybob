import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

import CallRecordingLink from "@/components/calls/CallRecordingLink";

describe("CallRecordingLink", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logs telemetry when clicked", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <CallRecordingLink
          callId="call-1"
          workspaceId="workspace-1"
          recordingUrl="https://example.com/recording.mp3"
        />,
      );
    });
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    act(() => {
      anchor?.click();
    });
    expect(logSpy).toHaveBeenCalledWith("[calls-session-recording-open-click]", {
      callId: "call-1",
      workspaceId: "workspace-1",
    });
    root.unmount();
  });
});
