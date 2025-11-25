import { describe, expect, it } from "vitest";

import { generateQuoteForJob } from "@/lib/domain/quotes";

describe("generateQuoteForJob", () => {
  it("throws when job_id is not a valid UUID", async () => {
    const formData = new FormData();
    formData.set("job_id", "not-a-uuid");

    await expect(generateQuoteForJob(formData)).rejects.toThrow("Job ID is required");
  });
});
