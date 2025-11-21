# HandyBob AI & Automation Overview

This is a quick reference on how AI classification and automations work today. It is intentionally plain-language and conservative; the contractor must review all leads and actions.

## AI categorization
- What it does: When a job/lead is created (especially from a voicemail call), we ask OpenAI to classify the work into a category (plumbing, electrical, etc.) and an AI urgency (emergency, this_week, flexible) with a confidence score.
- Where it runs:
  - Voicemail/call-created leads: `app/calls/processCallAction.ts`, `app/api/webhooks/voice/route.ts`.
  - Manual “Re-classify with AI” on a job: `app/jobs/[id]/classifyJobAction.ts`.
- Storage: Results are saved on the job (`ai_category`, `ai_urgency`, `ai_confidence`) and on calls (`ai_category`, `ai_urgency`).
- Imperfect by design: AI guesses can be wrong. The contractor must verify all classifications before acting.

## Urgency determination
- Prompted categories: emergency, this_week, flexible (and other non-emergency buckets).
- “Emergency” is triggered by language like water/gas leaks, sparking, fire, etc., as inferred by the model. It is still a best-effort guess.
- Policy: We only trigger automations on `ai_urgency = 'emergency'` right now.

## Current automations
- Rule: New urgent lead → send alert.
- Conditions: job.status = lead AND ai_urgency = emergency.
- Actions:
  - Email alert (Resend) if enabled.
  - SMS alert (Twilio) if enabled and a phone number is configured.
- Where this runs: `utils/automation/runLeadAutomations.ts` (triggered from call-created leads and manual reclassify when urgency is emergency).
- Best-effort: alerts are not guaranteed (email/SMS delivery can fail). Contractor remains responsible for reviewing leads and following up.

## Turning alerts on/off and tweaking thresholds
- Settings UI: `/settings/automation` lets you toggle:
  - Email alerts for new urgent leads (on/off).
  - SMS alerts for new urgent leads (on/off) + alert number.
- Urgent definition: currently fixed to `ai_urgency = emergency`. There is no UI to change the threshold yet; code-level changes would go in `runLeadAutomations` and the classification prompt (`utils/ai/classifyJob.ts`).
- Visibility: Recent automation events (last 10) are visible on `/settings/automation` to confirm whether alerts attempted/delivered/failed.

## Extending automations
- Add rules: Use `utils/automation/runLeadAutomations.ts` as the hook point or create new helpers in `utils/automation`. Log outcomes to `automation_events` for observability.
- Classification prompt: adjust categories/urgencies in `utils/ai/classifyJob.ts`.
- Attention rules: dashboard “attention” logic lives in `app/page.tsx` and `utils/attention/attentionModel.ts`.

## Responsibilities and disclaimers
- AI is a guide, not a decision-maker. Always review lead details and AI outputs.
- Alerts are best-effort; delivery is not guaranteed. Check the app for the source of truth on new leads and status.
