# HandyBob Architecture Health Checklist

Use this as a lightweight guardrail when adding routes, domain services, or refactors.

1. **Domain services first** – Keep all business logic inside `lib/domain/*`. Routes, actions, and webhooks should call these helpers rather than re-implementing SQL/rules.
2. **Internal routes require RLS context** – Every authenticated page or action under `app/(app)` or `app/<feature>` must start with `createServerClient` + `getCurrentWorkspace` so queries automatically filter by `workspace_id`.
3. **Public surfaces use tokens/slugs & admin client** – `app/public/*` routes resolve workspaces via slug/token and run only on the server with `createAdminClient` (or equivalent service-role clients); never expose auth requirements or service keys to the browser.
4. **Attention logic central** – Point every attention/high-priority query (dashboard, widgets) at `lib/domain/attention.ts#getAttentionItems` and share the cutoffs/helpers defined there rather than duplicating thresholds.
5. **Webhooks delegate to domain helpers** – Stripe, Twilio, Resend, etc. routes should only normalize & validate payloads, then call domain-level functions (`lib/domain/payments.ts`, `lib/domain/calls.ts`, `lib/domain/sms.ts`, etc.).
6. **Domain testing mandate** – Each new feature or helper in `lib/domain` should gain a Vitest file under `tests/domain/` that covers at least one happy path and one failure path; focus integration tests on the HTTP entrypoints (`tests/publicBooking.test.ts`, `tests/voice/*`).
