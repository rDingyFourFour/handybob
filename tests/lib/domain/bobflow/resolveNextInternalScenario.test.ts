import { describe, expect, it } from "vitest";

import { resolveNextInternalScenario, type SnapshotRecord } from "@/lib/domain/bobflow/resolveNextInternalScenario";

const diagnoseSnapshotPayload = {
  sessionId: "session-1",
  responseId: "response-1",
  createdAt: "2025-01-01T00:00:00.000Z",
  sections: [
    {
      type: "steps",
      title: "Steps",
      items: ["Inspect pipe"],
    },
  ],
};

const materialsSnapshotPayload = {
  items: [{ name: "Pipe", quantity: "1", notes: "none" }],
};

const quoteSnapshotPayload = {
  lines: [
    {
      description: "Labor",
      quantity: 1,
    },
  ],
};

describe("resolveNextInternalScenario", () => {
  const buildSnapshot = (task: SnapshotRecord["task"], payload: unknown): SnapshotRecord => ({
    task,
    payload,
  });

  it("recommends Diagnose when no usable snapshot exists", () => {
    expect(resolveNextInternalScenario([])).toBe("Internal.diagnose");
  });

  it("recommends Materials when Diagnose exists but Materials is missing or empty", () => {
    const snapshots = [buildSnapshot("job.diagnose", diagnoseSnapshotPayload)];
    expect(resolveNextInternalScenario(snapshots)).toBe("Internal.materials");
  });

  it("recommends Quotes when Diagnose and Materials are usable but Quote is missing", () => {
    const snapshots = [
      buildSnapshot("job.diagnose", diagnoseSnapshotPayload),
      buildSnapshot("materials.generate", materialsSnapshotPayload),
    ];
    expect(resolveNextInternalScenario(snapshots)).toBe("Internal.quotes");
  });

  it("returns Internal.msg when Diagnose, Materials, and Quote snapshots are ready", () => {
    const snapshots = [
      buildSnapshot("job.diagnose", diagnoseSnapshotPayload),
      buildSnapshot("materials.generate", materialsSnapshotPayload),
      buildSnapshot("quote.generate", quoteSnapshotPayload),
    ];
    expect(resolveNextInternalScenario(snapshots)).toBe("Internal.msg");
  });
});
