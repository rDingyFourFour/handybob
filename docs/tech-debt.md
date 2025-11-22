# Technical debt

This document captures the outstanding work called out in comments, migrations, and scaffolds.

## Voice ingestion & multi-tenant routing
- `app/api/voice/inbound/route.ts` still hard-codes a fallback `VOICE_FALLBACK_USER_ID`. Once every workspace owns its own Twilio number we need to map the incoming `To` number to a `user_id/workspace_id` instead of relying on one default (see `TECH_DEBT #1`).
- The same file also always inserts calls tied to `inbound_voicemail` even though future tenants need workspace-scoped rows and explicit job linkage.
- `app/api/webhooks/voice/route.ts` currently runs both the TwiML welcome flow and the recording callback in the same handler; splitting it into `/voice/inbound` + `/voice/recording` would make the routing clearer and allow stronger boundaries around what gets created in Supabase (see `TECH_DEBT #5`).
- `supabase/migrations/20250206123000_update_messages_calls_columns.sql` has TODO notes about ensuring inbound voice webhook logic attaches customers, jobs, and metadata when inserting calls and adding indexes that stay aligned with future lookups (see `TECH_DEBT #2`).

## Inbound messaging & timeline fidelity
- `utils/communications/logMessage.ts` documents the inbound messaging webhook we still need (`/api/webhooks/email` or `/api/webhooks/sms`). That endpoint must match/create a customer, find the most recent job/quote/invoice, and insert `direction = 'inbound'` rows so replies show up chronologically (see `TECH_DEBT #3`).
- The same migration above points out volume-related columns (`from_address`, `to_address`, `via`, `sent_at`) and reminds us to keep job/quote/invoice linkage intact for rich timelines.

## Test surface
- `tests/voice/voiceWebhook.test.ts` is currently skipped. The TODO is to build a `NextRequest` with `formData` (RecordingUrl/From/To), mock `createAdminClient`, mock OpenAI/Twilio fetches, and assert that a job/call row is inserted from the webhook flow (see `TECH_DEBT #6`).
