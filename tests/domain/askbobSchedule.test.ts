import { describe, it, expectTypeOf } from "vitest";

import type { AskBobTask } from "@/lib/domain/askbob/types";

describe("AskBob job schedule task", () => {
  it("includes job.schedule in the task union", () => {
    expectTypeOf<"job.schedule">().toMatchTypeOf<AskBobTask>();
  });
});
