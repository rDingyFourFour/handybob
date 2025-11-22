# Supabase usage guide

HandyBob keeps Supabase access centralized so credentials and RLS rules stay predictable:

1. **Browser/client interactions** (login/signup forms, public widgets) import `createClient` from `utils/supabase/client.ts`. That factory uses `createBrowserClient` plus only the `NEXT_PUBLIC_*` keys, so protected keys never reach the browser.
2. **Server-rendered/authenticated flows** in `app/`, `utils/` helpers, or any server action should import `createServerClient` from `utils/supabase/server.ts`. It reuses the publishable key but propagates the visitor’s cookies so Supabase enforces RLS with the signed-in user’s session.
3. **Service-role/admin workflows** (webhooks, background jobs, public API endpoints, migrations) must import `createAdminClient` from `utils/supabase/admin.ts`. That factory is the only place `SUPABASE_SERVICE_ROLE_KEY` is referenced, and it never runs on the client.

Document these policies in code comments near each factory so future authors know which client to use. When you spot repeated raw queries (e.g., job timelines fetching quotes/calls/messages), wrap them in helper functions inside `utils/...` (for example, `utils/ai/jobTimelinePayload.ts` already bundles job history retrieval). That keeps controllers thin and reuse consistent.
