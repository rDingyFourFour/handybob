"import { describe, it } from "vitest";

// This route is heavily tied to Next's Request/FormData and Twilio callbacks.
// The test is marked skipped and serves as a scaffold for wiring a fake
// Twilio payload into the /api/webhooks/voice POST handler once request
// factories/mocks are available.
// candidate for removal: placeholder test never executes and just catalogs a TODO.
describe.skip("voice webhook", () => {
  it("creates a job from a voicemail payload", async () => {
    // TODO: build a NextRequest with formData containing RecordingUrl/From/To,
    // mock createAdminClient to return a stub Supabase client,
    // mock OpenAI/Twilio fetches, and assert a job row is inserted.
  });
});
