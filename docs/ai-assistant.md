# HandyBob AI Assistant Overview

## What it does
- **Job AI**: summarizes a job, suggests next actions, and drafts follow-ups (email/SMS). Everything is editable and opt-in—nothing auto-sends.
- **Customer AI**: summarizes the relationship across all jobs and drafts a friendly check-in message. Also opt-in and editable.
- **Safety**: User-scoped queries only; payloads are trimmed to avoid leaking other jobs/users and to reduce prompt size.

## Entry points
- **Job page**: `app/jobs/[id]/page.tsx`
  - Components: `JobSummaryPanel`, `NextActionsPanel`, `JobFollowupHelper`, `AiAssistantPanel`
  - Actions: `jobSummaryAction.ts`, `nextActionsAction.ts`, `followupActions.ts`, `assistantActions.ts`
- **Customer page**: `app/customers/[id]/page.tsx`
  - Components: `CustomerSummaryPanel`, `CustomerCheckinHelper`, `AiAssistantPanel`
  - Actions: `customerAiActions.ts`, `assistantActions.ts`

## Timeline payload helpers (single source of truth)
- **Job history**: `utils/ai/jobTimelinePayload.ts`
  - Fetches job/customer plus quotes, invoices, appointments, messages, calls, payments.
  - Caps event count and truncates long text before prompts.
- **Customer history**: `utils/ai/customerTimelinePayload.ts`
  - Fetches customer + all jobs and related activity.
  - Caps events and truncates content to stay scoped and small.

## OpenAI calls (Responses API)
- Endpoint: `https://api.openai.com/v1/responses`
- Model: `process.env.OPENAI_MODEL` or defaults to `gpt-4.1-mini` (chosen for speed/cost).
- Response format: JSON when structured output is needed (next actions, follow-ups, check-ins); plain text otherwise.
- Never log raw OpenAI responses. We only parse required fields.

## Adjusting prompts or models
- Update prompts in the server actions listed above (job/customer summary, follow-up, next actions, check-in).
- To change model: set `OPENAI_MODEL` env var (e.g., `gpt-4.1`, `gpt-4o-mini`). Keep Responses API compatibility.
- To change payload size: tweak caps/truncation in `jobTimelinePayload.ts` and `customerTimelinePayload.ts`.

## Caveats
- Summaries and suggestions can be imperfect; they are not legal, financial, or compliance advice.
- Outputs are suggestions only; all send flows require explicit user action (no auto-send).
- Ensure `OPENAI_API_KEY` is set in the environment; friendly errors are shown otherwise.
