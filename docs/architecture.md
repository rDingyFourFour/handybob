# HandyBob Architecture – Workspaces, Roles, and Data Isolation

Audience: new senior engineers onboarding to the HandyBob codebase.

## Workspaces and membership
HandyBob is multi-tenant at the workspace (business) level.
- `public.workspaces`: one per business/account. Core columns: `id`, `name`, `owner_id`, `primary_contact_user_id`, `brand_name`, `brand_tagline`, `business_email`, `business_phone`, `business_address`.
- `public.workspace_members`: join table linking users to workspaces with `role` enum (`owner`, `staff`). A user may belong to multiple workspaces; current UI assumes a primary/first membership.
- Helper: `public.is_workspace_member(uuid)` checks membership with `auth.uid()`. `public.default_workspace_id()` returns the first workspace for the current user.

## Workspace-scoped tables
All core domain tables carry `workspace_id` and use workspace membership for access:
- Domain: `jobs`, `customers`, `quotes`, `quote_payments`, `invoices`, `appointments`, `messages`, `calls`, `media`, `automation_preferences`, `automation_settings`, `automation_events`, `pricing_settings`.
- System/observability: `audit_logs`.
- Workspace/meta: `workspaces`, `workspace_members` (membership is enforced via role checks, not `workspace_id` ties), `workspaces` profile fields.

### RLS pattern
The primary guard is workspace membership, not `user_id`.
```
alter table public.<table> enable row level security;

create policy "Allow workspace members to read <table>"
on public.<table>
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to write <table>"
on public.<table>
for all
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
```
`user_id` is kept for attribution (who created/sent) and secondary filters, not for the primary access check.

## Roles and restricted pages
- Roles: `owner`, `staff`.
- Owners: can manage workspace-level settings (workspace profile, pricing, automation, activity log). UI and server actions gate these via `requireOwner`.
- Staff: can work with jobs, customers, quotes, invoices, appointments, messages, calls, media; cannot edit workspace-level settings. Pages show labels like “Workspace settings for …” to clarify scope.
- Future extension: add role-based capabilities per feature (e.g., staff read-only invoices, billing admin). Centralize checks in helpers (e.g., extend `requireOwner` to `requireRole/permit`).

## Audit log
Table: `public.audit_logs`.
- Columns: `id`, `workspace_id`, `actor_user_id` (nullable for system webhooks), `action`, `entity_type`, `entity_id` (text), `metadata` (jsonb), `created_at`.
- RLS: members of the workspace can read/insert (using `is_workspace_member`).
- Sources: job creation (manual/voicemail), quote lifecycle (create/send/accept/pay), invoice lifecycle (create/send/pay), settings updates (pricing, automation, workspace profile), Stripe webhook payments. See `utils/audit/log.ts` and inline comments near audit writes.

## How users relate to data
- Every user action is tied to a workspace via `getCurrentWorkspace` (first membership by default). Actions include inserts/updates scoped by `workspace_id` and optionally `user_id` for attribution.
- Public pages (quote/invoice) read via token and join workspace for branding/contact info.
- Emails/SMS pull workspace profile for branding.

## Extending roles/permissions
When adding new features or tables:
1) Add `workspace_id` and index; backfill via `default_workspace_id()` for existing rows.
2) Apply the RLS template above.
3) Keep `user_id` for attribution.
4) Expose workspace context in the UI/header and clarify scope on workspace-level pages.
5) Add audit logs for material lifecycle events.
6) If adding finer roles, create helpers (e.g., `requireRole`, `assertCapability(feature, role)`) and centralize capability maps to avoid scattering checks.

## Reference files
- Workspace helpers: `utils/workspaces.ts`
- RLS pattern doc: `docs/rls-workspaces.md`
- Audit helper: `utils/audit/log.ts`
- Settings pages (owner-only): `app/settings/workspace`, `app/settings/pricing`, `app/settings/automation`, `app/settings/activity`
- Public pages with branding: `app/public/quotes/[token]/page.tsx`, `app/public/invoices/[token]/page.tsx`
