## Running Vercel `build` locally

To reproduce what Vercel does during a production deploy, run:

```bash
npx vercel build
```

That uses the same Next.js entrypoints as the cloud (App Router, API routes, `next build`), but via the Vercel CLI. For convenience the repo also exposes:

```bash
npm run vercel:build
```

which simply runs `vercel build` so you don’t have to install the CLI globally.

### Environment variables
Vercel uses the production secrets you configured in the dashboard. Locally you must provide the same ones (or suitable stand-ins) so server components that talk to Stripe/Twilio/Supabase/OpenAI continue to work:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`

Set them via your `.env.local` (which is already listed in `.gitignore`) or by exporting them before running the build command. If you don’t have real production values handy, mock harmless placeholders locally just to keep the build from rejecting when those env vars are missing.

This routine is purely for local diagnostics; Vercel itself still just runs `npm run build` under the hood.

### Kill switches for build diagnostics
If Vercel still hits a timeout, rerun the build with `BUILD_DIAGNOSTICS=true` plus one of the `DISABLE_*_FOR_BUILD` flags. Each flag only takes effect during `next build`/`vercel build` (`process.env.NEXT_PHASE === "phase-production-build"`) and replaces the heavy route with a small stub so Supabase/Twilio/OpenAI work never runs during compilation:

- `DISABLE_CALLS_FEATURE_FOR_BUILD`: stubs `app/calls/page.tsx`.
- `DISABLE_PUBLIC_BOOKING_FOR_BUILD`: stubs `app/public/bookings/[slug]/page.tsx`.
- `DISABLE_AI_FOR_BUILD`: stubs `app/jobs/[id]/page.tsx` and `app/customers/[id]/page.tsx`, skipping the AI-heavy dashboards.

Use these flags in a binary-search fashion (flip one on, rerun the build, then try the next) and watch the console for `buildLog` lines so you can pinpoint which surface triggered the hang. Remember to unset the flags for normal deploys.
