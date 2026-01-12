import { describe, expect, it } from "vitest";

import { resolveNextInternalScenario } from "./resolveNextInternalScenario";

const DIAGNOSE_PAYLOAD = {
  sections: [
    {
      items: ["Test diagnose content"],
    },
  ],
};

const MATERIALS_PAYLOAD = {
  items: [
    {
      name: "Pipe",
      quantity: 1,
    },
  ],
};

const QUOTE_PAYLOAD = {
  lines: [
    {
      description: "Labor",
      quantity: 1,
    },
  ],
};

const buildSnapshot = (task: string, payload: unknown) => ({
  task,
  payload,
});

describe("resolveNextInternalScenario", () => {
  it("returns Internal.diagnose when no snapshots are available", () => {
    const nextScenario = resolveNextInternalScenario(null);
    expect(nextScenario).toBe("Internal.diagnose");
  });

  it("returns Internal.materials when only diagnose is usable", () => {
    const snapshots = [buildSnapshot("job.diagnose", DIAGNOSE_PAYLOAD)];
    const nextScenario = resolveNextInternalScenario(snapshots);
    expect(nextScenario).toBe("Internal.materials");
  });

  it("returns Internal.quotes when diagnose and materials are usable but quote is missing", () => {
    const snapshots = [
      buildSnapshot("job.diagnose", DIAGNOSE_PAYLOAD),
      buildSnapshot("materials.generate", MATERIALS_PAYLOAD),
    ];
    const nextScenario = resolveNextInternalScenario(snapshots);
    expect(nextScenario).toBe("Internal.quotes");
  });

  it("returns null when diagnose, materials, and quote snapshots are all usable", () => {
    const snapshots = [
      buildSnapshot("job.diagnose", DIAGNOSE_PAYLOAD),
      buildSnapshot("materials.generate", MATERIALS_PAYLOAD),
      buildSnapshot("quote.generate", QUOTE_PAYLOAD),
    ];
    const nextScenario = resolveNextInternalScenario(snapshots);
    expect(nextScenario).toBeNull();
  });
});
