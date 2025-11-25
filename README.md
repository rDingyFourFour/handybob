This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Build / CI guidance

- `npm run build` (defined as `next build` in `package.json`) is the only script Vercel executes during install/build time (`package.json:8-19`); there are no `prebuild`/`postbuild` hooks or lint/test chains wrapped around it.
- Tests (`npm run test`, powered by Vitest via `vitest.config.ts:1-16`) are CI/locally run only and should be triggered from your GitHub Actions or another dedicated pipeline so the Vercel worker never waits for the suite to finish.
- Keep `npm run build` focused on the optimized Next.js build; any long-running checks (lint, tests, Supabase migrations, etc.) should run in `npm run lint` / `npm run test` or other scripts that you invoke outside of Vercel’s default deployment command.
- To profile bundle sizes locally, run `npm run analyze`; it sets `NEXT_DISABLE_TURBOPACK=1` and `ANALYZE=true` before `next build` so `@next/bundle-analyzer` runs on Webpack and reports which routes and modules dominate the bundle. This stays local and should not run on Vercel.
- For local profiling, run `npm run profile-build`; it wraps `next build` and prints start/finish timestamps so you can see if the hang happens during compilation or a custom hook. This script isn’t invoked on Vercel (only locally).

## Stripe payments

HandyBob now exposes a Stripe webhook at `/api/stripe/webhook`. The handler verifies incoming events with `STRIPE_WEBHOOK_SECRET`, marks the matching quote as `paid`, and records the payment in `quote_payments` for reporting.

1. Create the `quote_payments` table by running the SQL in `supabase/migrations/20250128120000_add_quote_payments.sql` against your Supabase project.
2. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to your environment.
3. In development you can forward events with `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### Payment + invoice flow
- Quote → Payment Link → Stripe checkout → `checkout.session.completed` webhook.
- Webhook (server-only) marks the quote `paid`, upserts `quote_payments`, ensures an invoice exists, marks the invoice paid, and emails a receipt.
- Public access: customers view quotes at `app/public/quotes/[token]` and invoices at `app/public/invoices/[token]`; both use anonymous tokens and never expose secrets.
- RLS: `quote_payments` and `invoices` enforce `user_id = auth.uid()` for selects/updates/inserts; webhooks bypass RLS via the service-role Supabase client.
- Stripe metadata: Payment Links carry `quote_id` + `user_id`; webhook uses these to reconcile payments → quotes → invoices.
