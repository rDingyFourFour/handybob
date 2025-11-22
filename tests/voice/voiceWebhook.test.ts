"import { describe, it } from "vitest";

// This route is heavily tied to Next's Request/FormData and Twilio callbacks.
// The test is marked skipped and serves as a scaffold for wiring a fake
// Twilio payload into the /api/webhooks/voice POST handler once request
// factories/mocks are available (TODO [TECH_DEBT #6]: exercise the webhook end-to-end).
describe.skip("voice webhook", () => {
  it("creates a job from a voicemail payload", async () => {
// TODO [TECH_DEBT #6]: build a NextRequest with formData containing RecordingUrl/From/To,
// mock createAdminClient to return a stub Supabase client,
// mock OpenAI/Twilio fetches, and assert a job row is inserted.
  });
});
