# Naming conventions

Use this reference when adding new routes, components, or helpers so the repo stays predictable.

## Pages & routes
- Prefer plural nouns for collection routes (`app/jobs`, `app/customers`, `app/quotes`, etc.). Singular folders only appear for special pages (`new`, `[id]`, `(auth)` segments), and nested resources stay under the parent collection (e.g., `app/public/bookings/[slug]` for booking links and `app/public/workspaces/[slug]/lead` for workspace-level lead pages).
- Keep route folder names lowercase and use clear verbs for special flows (`app/appointments/new`, `app/calls/processCallAction`), so it’s obvious what the route does.
- Align navigation paths with these folder names (e.g., `/public/bookings/{slug}` now matches `app/public/bookings/[slug]`) and avoid duplicates such as both `/public/booking` and `/public/bookings`.

## Shared components
- Store reusable UI pieces inside `components/` (and optional subfolders such as `components/ui`) so any page can import them without deep relative paths.
- Route-specific helpers or presentation components that tightly couple to a page can remain next to that page in `app/...`, but prefer `components/` when the same panel is reused across multiple pages.

## Utility modules
- Group helpers by domain under `utils/{domain}` (for example, `utils/ai`, `utils/automation`, `utils/communications`, `utils/sms`). Each folder should expose a small public surface (e.g., `runLeadAutomations` or `sendCustomerMessage`).
- Keep cross-cutting infrastructure under dedicated folders (`utils/supabase` for client/server/admin helpers, `utils/env` for shared environment constants) so imports stay readable (`@/utils/supabase/client` rather than `@/utils/common`).
- Avoid creating a separate `lib/` folder unless the new code genuinely lives outside the current domains—stick with `utils` for now.
