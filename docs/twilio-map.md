# Twilio Map

## SDK imports and config
- `package.json` installs `twilio` (v5.10.5) for server-side usage. Environment helpers live in `schemas/env.ts` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) and everyone relies on `TWILIO_FROM_NUMBER`, plus `VOICE_FALLBACK_USER_ID` for legacy voice routing.
- Supabase config (`supabase/config.toml`, `auth.sms.twilio`) documents how to plug Twilio into Supabase’s SMS auth provider.

## Outbound SMS
- `utils/sms/sendTwilioSms.ts` centralizes the Twilio client, handles logging, and returns metadata once a send succeeds. All outbound helpers call it:
  * `utils/sms/sendCustomerSms.ts` (used from `app/inbox/page.tsx`, `app/jobs/[id]/followupActions.ts`, `app/customers/[id]/customerAiActions.ts`, `utils/automation/runLeadAutomations.ts`).
  * `utils/sms/sendQuoteSms.ts` (`app/quotes/[id]/page.tsx`).
  * `utils/sms/sendInvoiceSms.ts` (`app/invoices/[id]/page.tsx`), which also logs SMS events via `utils/communications/logMessage.ts`.

## Inbound Twilio/webhook flows
- Primary voice endpoint: `app/api/webhooks/voice/route.ts` responds to stage 1 (TwiML + `<Record>`) and stage 2 (recording callback), validates Twilio signatures, fetches recordings with Basic auth, calls OpenAI for transcripts, and creates leads/customers.
- Legacy split endpoints:
  * `app/api/voice/inbound/route.ts` (VoiceResponse that records, inserts a `calls` row with `direction="inbound"` and `status="inbound_voicemail"` tagged to `VOICE_FALLBACK_USER_ID`).
  * `app/api/voice/recording/route.ts` (records `RecordingUrl`, `CallSid`, `duration` on the matching `calls` row, optionally fires `processCallById`, and returns JSON so Twilio retries on failure).
- Tests: `tests/voice/voiceWebhook.test.ts` is skipped but is the scaffold for mocked Twilio payloads and Supabase assertions.

## Calls table insert/update surface
- `app/api/webhooks/voice/route.ts` inserts call rows (with recording URL, AI summaries, inferred job/automation data) once a recording callback completes.
- `app/api/voice/inbound/route.ts` inserts inbound call metadata before the recording arrives; `app/api/voice/recording/route.ts` updates that call row with the recording URL, duration, and status.
- Manual or reprocess paths go through `app/calls/processCallAction.ts`, which downloads the Twilio recording (Basic auth with `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`), transcribes via OpenAI, updates `calls` fields, auto-creates jobs/customers, and keeps `processCallRecording`/`processCallById` as entry points.

## SMS logging in `messages`
- `utils/communications/logMessage.ts` abstracts inserting rows into `messages`. Twilio-triggered SMS sends that call it include:
  * `app/quotes/[id]/page.tsx` (logs the SMS after `sendQuoteSms`).
  * `app/invoices/[id]/page.tsx` (logs the SMS after `sendInvoiceSms`).
  * Other helpers that route through `logMessage` (e.g., `app/inbox/page.tsx` via direct Compose bar submissions).
- TODO (TECH_DEBT #3): inbound SMS/email replies should land in `/api/webhooks/sms` or `/api/webhooks/email`, find/create the customer/job, and insert `direction="inbound"` rows so the inbox reflects replies.

## Manual QA checklist (Twilio flows)
- **Outbound SMS**
  1. From the quote/job page, click “Send via SMS” (or send from Inbox). Use a Twilio test number or real phone.
  2. Confirm Twilio reports delivery, a `messages` row appears with `direction=outbound`, and the Inbox/job timeline shows the SMS.
  3. Check `sendOutboundSms` logs (`[context]=sendQuoteSms/sendInvoiceSms/sendCustomerSms`) for `messageSid` and status.
- **Inbound SMS**
  1. (If supported) reply to the Twilio phone number using another device or Twilio’s test simulator.
  2. Watch for a new `messages` row with `direction=inbound` and `via=sms`, linked to the right customer/job.
  3. Look at `/api/webhooks/sms/route.ts` logs for signature validation and payload info.
- **Inbound calls**
  1. Call the Twilio number and leave a voicemail.
  2. Verify `/api/voice/inbound` created a `calls` row with `twilio_call_sid`, `from_number`, and `status=inbound_voicemail`.
  3. When Twilio hits `/api/voice/recording`, confirm `recording_url`/`duration` update and `processCallById` logs the transcription/AI steps.
  4. Check the Calls UI for the recording, transcript, summary, and that the job timeline references the call.
- **Error handling**
  1. While in Twilio test mode, send to a reserved invalid number to force failure.
  2. Confirm the UI displays an error message, logs include `[context]` plus error text, and no duplicate `messages` rows appear.
  3. Check that `messages` rows still log even after the failure (status `failed`) for diagnostics.
