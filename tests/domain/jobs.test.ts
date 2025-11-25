import { describe, expect, it, vi } from "vitest";

import { classifyJobWithAi } from "@/lib/domain/jobs";

const createAdminClientMock = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => {
    createAdminClientMock();
    return {};
  },
}));

describe("classifyJobWithAi", () => {
  it("returns null when OPENAI_API_KEY is missing", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const result = await classifyJobWithAi({ jobId: "00000000-0000-0000-0000-000000000000" });

    expect(result).toBeNull();
    expect(createAdminClientMock).not.toHaveBeenCalled();
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });
});
