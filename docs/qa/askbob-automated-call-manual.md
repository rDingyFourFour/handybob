# AskBob Automated Call Manual QA Checklist (Step 9)

## Preconditions
- Twilio account is configured and credentials are present in env vars (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).
- Workspace has an outbound business phone number or TWILIO_FROM_NUMBER is set.
- Callback URLs resolve and are reachable from Twilio:
  - /api/twilio/calls/status
  - /api/twilio/calls/recording
  - /api/twilio/voice/outbound
- App URL is configured (APP_URL or equivalent) so callback URLs are generated correctly.
- Job has a customer with a valid phone number and a Step 7 script is present.

## Happy path
- Open a job and navigate to AskBob Step 9.
- Confirm script preview is present and customer phone is set.
- Click Place automated call.
- Verify the UI shows Call started and a link to the call session.
- Observe Twilio status updates in the success banner as polling runs.
- Wait for the call to complete and for recording to transition from processing to ready.
- Open the call session and confirm:
  - Automated call strip renders with the speech plan summary.
  - Twilio status strip is visible and shows latest status.
  - Recording strip shows recording available.
- Capture the call outcome (Reached + Outcome + Notes) and save.
- Verify After-call help CTA is enabled and generates a follow-up draft.
- Optionally open Messages composer with the draft.

Telemetry to see in this phase
- Step 9 UI request and result:
  - [askbob-automated-call-ui-request]
  - [askbob-automated-call-ui-submit]
  - [askbob-automated-call-ui-result]
- Server action:
  - [askbob-automated-call-action-request]
  - [calls-automated-call-session-created]
  - [askbob-automated-call-speechplan-saved]
  - [calls-automated-dial-attempt]
  - [calls-automated-dial-success]
  - [askbob-automated-call-action-success]
- Status polling:
  - [askbob-automated-call-status-poll-request]
  - [askbob-automated-call-status-poll-success]
- Twilio callbacks:
  - [twilio-outbound-voice-twiml-served]
  - [twilio-call-status-callback-received]
  - [twilio-call-status-callback-update]
  - [twilio-call-recording-callback-received]
  - [twilio-call-recording-callback-applied]
- Call session UI strips:
  - [calls-session-askbob-automated-details-visible]
  - [calls-session-twilio-status-visible]
  - [calls-session-recording-visible]
- Outcome + after-call:
  - [calls-outcome-save-success]
  - [calls-after-call-outcome-saved-nudge]
  - [askbob-after-call-ui-request]
  - [askbob-after-call-generate-request]
  - [askbob-after-call-ui-success]
  - [calls-after-call-ui-generate-result]

## Expected UI strips and when they should appear
- Automated call strip appears on the call session page only when an automated speech plan summary exists (AskBob automated call metadata is present in the call summary).
- Twilio status strip appears when twilio_call_sid or twilio_status exists on the call.
- Recording strip appears when twilio_call_sid exists. It will show Recording pending until recording URL or SID arrives, then Recording available once duration is present.
- After-call readiness and CTA are enabled only when the call is terminal, an outcome is recorded, and reached flag is recorded. The CTA also requires some context (script, notes, or summary).

## Common not a bug cases (gates not met)
- Automated call strip is missing when the call does not contain an AskBob automated speech plan summary or metadata.
- Twilio status strip is missing when the call has neither twilio_call_sid nor twilio_status.
- Recording strip is missing when twilio_call_sid is absent, even if the call is automated.
- Outcome required banner appears when the call is terminal but outcome is missing. This is expected and must be resolved by saving an outcome.
- After-call CTA is disabled if any readiness gate fails:
  - Call is not terminal.
  - Outcome is missing.
  - Reached flag is missing.
  - No context available (no script, notes, or summary).

## Debug steps
- Step 9 panel
  - Expand the panel and confirm the script preview, phone number, and the Place automated call CTA state.
  - If polling stalls, use the Open call session link and refresh.
- Call session page
  - Verify Twilio status and recording strips.
  - Confirm Automated call strip shows the speech plan summary.
  - Capture outcome and confirm the outcome saved confirmation.
- Logs
  - Confirm server action telemetry (askbob-automated-call-action-* and calls-automated-*).
  - Confirm Twilio webhook telemetry (twilio-call-status-callback-* and twilio-call-recording-callback-*).
  - Confirm polling telemetry (askbob-automated-call-status-poll-*).
  - Confirm after-call telemetry (askbob-after-call-* and calls-after-call-*).

## Telemetry reference by phase
- Step 9 UI
  - [askbob-automated-call-ui-request]
  - [askbob-automated-call-ui-submit]
  - [askbob-automated-call-ui-result]
  - [askbob-automated-call-robocall-guard-visible]
- Start call action and dial
  - [askbob-automated-call-action-request]
  - [askbob-automated-call-action-success]
  - [askbob-automated-call-action-failure]
  - [askbob-automated-call-action-reused_existing_session]
  - [askbob-automated-call-action-rejected_due_to_completed_call]
  - [askbob-automated-call-action-rejected_due_to_in_progress_call]
  - [calls-automated-call-session-created]
  - [askbob-automated-call-speechplan-saved]
  - [calls-automated-dial-attempt]
  - [calls-automated-dial-success]
  - [calls-automated-dial-failure]
- Polling
  - [askbob-automated-call-status-poll-request]
  - [askbob-automated-call-status-poll-success]
  - [askbob-automated-call-status-poll-failure]
- Twilio callbacks
  - [twilio-outbound-voice-twiml-served]
  - [twilio-outbound-voice-twiml-rejected]
  - [twilio-outbound-voice-twiml-db-error]
  - [twilio-call-status-callback-received]
  - [twilio-call-status-callback-update]
  - [twilio-call-status-callback-rejected]
  - [twilio-call-status-callback-unmatched]
  - [twilio-call-recording-callback-received]
  - [twilio-call-recording-callback-applied]
  - [twilio-call-recording-callback-duplicate]
  - [twilio-call-recording-callback-rejected]
  - [twilio-call-recording-callback-unmatched]
- Call session strips
  - [calls-session-askbob-automated-details-visible]
  - [calls-session-twilio-status-visible]
  - [calls-session-recording-visible]
  - [calls-after-call-outcome-required-visible]
- Outcome and after-call
  - [calls-outcome-save-success]
  - [calls-outcome-save-failure]
  - [calls-after-call-outcome-saved-nudge]
  - [askbob-after-call-ui-request]
  - [askbob-after-call-generate-request]
  - [askbob-after-call-ui-success]
  - [askbob-after-call-ui-failure]
  - [askbob-after-call-gate-not-ready]
  - [askbob-after-call-call-session-context]
  - [calls-after-call-ui-generate-click]
  - [calls-after-call-ui-generate-result]
  - [askbob-after-call-ui-generate-success]
  - [askbob-after-call-ui-generate-failure]
  - [calls-after-call-open-composer-click]
  - [askbob-after-call-open-messages]
