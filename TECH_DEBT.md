# Technical debt tracker

This single source of truth groups the open tickets surfaced while hardening HandyBob. Each bullet includes a short description, why it matters, and a priority rating (P1 security, P2 user-facing, P3 nice-to-have).

## Data model
1. **TECH_DEBT #1 – Twilio multi-tenant voice routing**  
   *What:* Replace the global `VOICE_FALLBACK_USER_ID` with a `To` ➜ `user/workspace` lookup so every call row gets a workspace_id and user_id.  
   *Why:* Without it all Twilio calls land in a single workspace, which breaks multi-tenancy and audit trails.  
   *Priority:* P2 (business logic + data correctness).
2. **TECH_DEBT #2 – Indexes for workspace lookups**  
   *What:* Add Supabase indexes on `(workspace_id, status)` or similar composites for jobs/calls/quotas being filtered frequently, plus indexes on `quotes.public_token`/`invoices.public_token`.  
   *Why:* Dashboards and public routes perform repeated filtered queries; indexes keep those queries fast.  
   *Priority:* P3 (performance, avoid future regressions).

## RLS / permissions
3. **TECH_DEBT #3 – Inbound message webhook**  
   *What:* Build the `/api/webhooks/email` (and/or SMS) listener that matches customers, attaches job/quote/invoice context, and inserts `direction = 'inbound'` rows.  
   *Why:* Timelines currently miss customer replies; until this exists we can’t guarantee conversations stay complete.  
   *Priority:* P2 (customer experience + accuracy).

## AI behavior
4. **TECH_DEBT #4 – AI timeline prompt regression tests**  
   *What:* Write regression helpers/tests that confirm `jobTimelinePayload`/`customerTimelinePayload` always trim transcripts and limit events before reaching OpenAI.  
   *Why:* Protects against accidentally exposing extra data when we tweak timeline queries.  
   *Priority:* P3 (AI prompt hygiene).

## Stripe / Twilio
5. **TECH_DEBT #5 – Split Twilio voice routes**  
   *What:* Break `/api/webhooks/voice` into separate `/voice/inbound` (returns TwiML) and `/voice/recording` (persists recording + AI + automations) while keeping the same Twilio signatures.  
   *Why:* Guarantees the recording callback can run independently, simplifies validation, and reduces coupled responsibilities.  
   *Priority:* P3 (architecture clarity).

## Testing
6. **TECH_DEBT #6 – Voice webhook integration test**  
   *What:* Unskip `tests/voice/voiceWebhook.test.ts` by mocking `createAdminClient`, Twilio payloads, and OpenAI results to assert jobs/calls/invoices get created from the webhook.  
   *Why:* We currently lack automation guardrails for the Twilio flow so regressions could silently break recordings.  
   *Priority:* P3 (test coverage).

Whenever you add a TODO/FIXME in the future, reference this tracker (e.g., `TODO [TECH_DEBT #3]: ...`) so we keep everything consolidated here.
