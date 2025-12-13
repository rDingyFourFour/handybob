import { afterEach, describe, expect, it, vi } from "vitest";

import * as saveCallOutcomeModule from "@/app/(app)/calls/actions/saveCallOutcome";
import { callOutcomeCaptureFormAction } from "@/app/(app)/calls/[id]/CallOutcomeCaptureCard";
import type { SaveCallOutcomeResponse } from "@/app/(app)/calls/actions/saveCallOutcome";

describe("callOutcomeCaptureFormAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inverts useActionState payload and forwards the FormData", async () => {
    const fakeResponse: SaveCallOutcomeResponse = {
      ok: true,
      callId: "call-1",
      reachedCustomer: null,
      outcomeCode: null,
      notes: null,
      recordedAtIso: null,
    };
    const actionSpy = vi
      .spyOn(saveCallOutcomeModule, "saveCallOutcomeAction")
      .mockResolvedValue(fakeResponse);

    const formData = new FormData();
    formData.append("callId", "call-1");

    const result = await callOutcomeCaptureFormAction(null, formData);

    expect(actionSpy).toHaveBeenCalledWith(formData);
    expect(result).toBe(fakeResponse);
  });
});
