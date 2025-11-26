## Build diagnostic flags

HandyBob exposes three env vars that only have an effect when `next build` or `vercel build` runs during `process.env.NEXT_PHASE === "phase-production-build"`. Toggle them to swap the respective route with a stub page and keep Supabase/Twilio/OpenAI logic out of the compile phase so you can binary-search the hang.

| Flag | Meaning |
| --- | --- |
| `DISABLE_CALLS_FEATURE_FOR_BUILD` | Skips `app/calls/page.tsx` and its Twilio/Supabase queries; the stub just renders a “Calls disabled for build diagnostics” notice. |
| `DISABLE_PUBLIC_BOOKING_FOR_BUILD` | Skips `app/public/bookings/[slug]/page.tsx` (and the associated Supabase admin lookup) in favor of a very light placeholder. |
| `DISABLE_AI_FOR_BUILD` | Skips both `app/jobs/[id]/page.tsx` and `app/customers/[id]/page.tsx`, avoiding AI assistant panels, OpenAI calls, and related Supabase work. |

### Usage
Run the build with the flags you need; small examples that turn them all on look like:

```bash
DISABLE_CALLS_FEATURE_FOR_BUILD=1 DISABLE_PUBLIC_BOOKING_FOR_BUILD=1 DISABLE_AI_FOR_BUILD=1 npm run build
DISABLE_CALLS_FEATURE_FOR_BUILD=1 DISABLE_PUBLIC_BOOKING_FOR_BUILD=1 DISABLE_AI_FOR_BUILD=1 npm run vercel:build
```

Set `BUILD_DIAGNOSTICS=true` alongside the flag(s) if you also want the `buildLog` traces from `next.config.ts`/`app/layout.tsx` while the build runs.

> Vercel runs whatever `npm run build` resolves to, so keep that script set to `next build` only. Run lint/tests through their own scripts (`npm run lint`, `npm run test`, etc.) outside of the Vercel build step to avoid dragging extra work into the compile phase.

### Build diagnostics with BUILD_DIAGNOSTICS
Run a local build with `BUILD_DIAGNOSTICS=1` so the instrumentation at `next.config.ts`, `app/layout.tsx`, `app/(marketing)/page.tsx`, `app/(app)/dashboard/page.tsx`, and the `lib/domain/*` helpers prints `[build] <timestamp> - <label>` lines to stdout. You can do:

```bash
BUILD_DIAGNOSTICS=1 npm run build
BUILD_DIAGNOSTICS=1 npx vercel build
```

The last label emitted before the build stalls is usually where the heavy work was triggered; combine that with the feature flags above to focus on the suspect module without wasting time on unrelated routes.

### Binary search process
1. Start with all three flags **enabled** and run `npm run build`. If the build completes, the hang lives in one of the skipped routes.
2. Re-enable one flag at a time (`DISABLE_CALLS_FEATURE_FOR_BUILD=0` etc.) and rerun the build. The first flag you toggle back on that causes the hang pinpoints the feature area. Be sure to reset any flags you changed before testing the next one.
3. If the build still hangs with all three flags enabled, the culprit is probably in a shared/core module (`app/layout.tsx`, `next.config.ts`, other global imports) rather than these feature routes.

Disable the flags for normal deploys once you're done debugging so the real pages stay live.
