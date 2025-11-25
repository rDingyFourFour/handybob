# HandyBob Architecture

## High-level platform
- **Next.js App Router** powers the whole experience: `app/layout.tsx` defines the root shell (global fonts, workspace-aware nav, authenticated vs. marketing banners), and most user features live as server/rsc-driven routes under `app/*`.  
- **Supabase** is the single source of truth for workspace, customer, job/quote/invoice, and communication data. Shared helpers like `createServerClient` (`utils/supabase/server.ts`) and `getCurrentWorkspace` (`utils/workspaces.ts`) encapsulate auth-aware context for every server component or action.
- **TypeScript-first domain models** in `types/domain.ts` keep entities consistent between route handlers, utilities, and React components.

## Routing and entry points
- `app/layout.tsx` wraps every route with the branded header, workspace summaries, and responsive navigation (desktop nav + `components/ui/MobileNav`). It fetches the Supabase user/workspace on the server so the header can show workspace info and sign-in CTAs.
- `app/page.tsx` (dashboard) is `dynamic = "force-dynamic"` and wires together Supabase helpers, attention models, and dynamically imported widgets (`components/dashboard/*`). It also exposes server actions (`updateAutomationPreferences`, `retryDashboardData`) so forms can mutate prefs or refresh data without duplicating fetch logic.
- Feature slices (`/customers`, `/jobs`, `/invoices`, `/quotes`, `/calls`, `/appointments`) live under `app/<feature>`. Many include nested dynamic routes (e.g., `app/customers/[id]/page.tsx`) that query Supabase, assemble timeline data, and render assistant or timeline panels (`components/CustomerSummaryPanel`, `CustomerCheckinHelper`, `AiAssistantPanel`).
- Public and webhook surfaces live under `app/public` and `app/api/*` respectively (e.g., Stripe webhooks, Twilio voice/webhook handlers, public quotes/invoices). Those routes typically use service-role Supabase clients that bypass RLS for background jobs (see `supabase/migrations/*` for schema hints).

## Data access and utilities
- Most server components use `createServerClient` + `getCurrentWorkspace` or domain helpers from `utils/` to scope data to the current workspace (`workspace_id = workspace.id`). Common utility folders include:
  - `utils/attention/`: helper rules for highlighting urgent leads/overdue work (`newLeadCutoff`, `staleQuoteCutoff`, etc.).
  - `utils/timeline/`: formatters (`formatCurrency`, `formatDateTime`) plus timeline sorting goodness for feeds in customer detail and dashboard widgets.
  - `utils/supabase/`: shared Supabase helpers (clients, paging, helpers for quotes/invoices).
  - Domain-specific helpers: `utils/communications`, `utils/appointments`, `utils/calls`, `utils/invoices`, `utils/payments`, `utils/sms`, etc., keep logic away from UI.
  - `utils/env/` and `utils/urls/` manage constants and canonical links (public booking, workspace URLs).

## UI composition
- Shared UI atoms live under `components/*`. Notable folders:
  - `components/dashboard/`: dynamic widgets and skeleton states for the dashboard.
  - `components/ui/`: primitives such as `MobileNav`, buttons, and other “hb-*” utilities that `globals.css` styles with Tailwind v4 (`@apply` + custom components).
  - `components/sms`, `components/ai`, `components/job-*`: domain-specific panels used by the jobs/customers routes.
- Many components rely on utility props (e.g., timeline `kind`, snippet formatting).
- Layout-level styling is centralized in `app/globals.css`, which imports `tailwindcss` and exposes custom classes like `.hb-card`, `.hb-heading-*`, and `.hb-muted` for consistent spacing/color.

## Integration touchpoints
- **Supabase migrations** live in `supabase/migrations/`; add new tables/RLS policies there when extending domain models. Templates for production `supabase/config.prod.template.toml` and local `config.toml` keep environment-specific secrets out of source control.  
- **Compose stack** in `compose.yaml` likely mirrors the local Supabase/postgres/service dependencies for development or CI.  
- **API routes & webhooks** under `app/api/*` handle Stripe payments, voice/call webhooks, and public lead imports. They use Supabase server helpers to enforce RLS (via `service_role` client in background jobs).  
- **Actions** (server actions declared with `"use server"`) appear in feature pages and respect Next.js data-flow (e.g., forms that update automation preferences call Supabase and revalidate paths).

## Testing/dev workflows
- `npm run dev` / `npm run build` / `npm run lint` / `npm run test` (Vitest) are defined in `package.json`. Tests live under `tests/` for integrations like public booking flows.  
- Linting uses `eslint` (per `eslint.config.mjs`). Tailwind v4 + PostCSS pipeline is configured with `postcss.config.mjs`.  

## How to extend
1. **Add routes** inside `app/<feature>`; keep server components, metadata, and layout logic close to the data fetch code.
2. **Share utilities** via `utils/` so similar filters/formatters can be reused without duplication.
3. **Style with existing tokens**: prefer the `.hb-*` classes and `@apply` helpers from `globals.css`.
4. **Use Supabase helpers** so RLS and workspace scoping stay consistent (`utils/supabase/server.ts`, `utils/workspaces.ts`).

## References
- Supabase config/migrations: `supabase/config.toml`, `supabase/migrations/*`  
- Next.js App Router entrypoints: `app/layout.tsx`, `app/page.tsx`  
- Shared components: `components/**/*`, especially `components/dashboard`, `components/ui`, `components/Customer*`  
- Utilities: `utils/*` (supabase clients, timeline formatters, attention models)
