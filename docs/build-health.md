## HandyBob build health

### What Vercel runs
- **Install:** `npm install` (default). No `preinstall`/`postinstall`/`prepare` hooks exist, so this just installs the dependencies as-is.
- **Build:** `npm run build`, which is `next build` (see `package.json:5-13`). Nothing else is chained onto this script, so Vercel compiles the App Router app alone.

### What Vercel _does not_ run
- `npm run lint` and `npm run test` (Vitest) are CI/local-only and do not execute during Vercel deploys. The README section “Build / CI guidance” explains that these belong outside of the Vercel `npm run build` command.
- Developer tooling such as `npm run profile-build` and `npm run analyze` is intentionally local-only for profiling/timing; these scripts wrap `next build` but are not invoked on Vercel.

### Known slow spots and mitigations
1. **Dynamic-only routes:** We added `export const dynamic = "force-dynamic"` to every data-heavy page so Next.js does not attempt to statically prerender Supabase/Stripe/Twilio workloads during build time. That keeps remote fetches out of the compile phase.
2. **Tailwind / TypeScript scan scope:** `tailwind.config.ts` now only targets the app/components/lib/utils directories, and `tsconfig.json`’s include/exclude lists avoid `.next`, node_modules, and other generated folders, reducing file walking overhead.
3. **Domain modules remain pure:** `lib/domain/*` only exports functions and lightweight constants; there are no Supabase/AWS/Twilio/network calls at import time, so importing these helpers during build doesn’t trigger expensive side effects.
4. **Local profiling tools:** `npm run profile-build` logs timestamps around `next build`, and `npm run analyze` runs `@next/bundle-analyzer` (via `next.config.ts`) so you can spot bulky routes locally before they hit Vercel.

### Build timeout checklist
1. Run `npm run profile-build` locally to see whether the hang occurs during Next.js compilation or within custom hooks (e.g., Supabase fetches tied to dynamic routes).
2. Re-check for any new `generateStaticParams` / `getStaticProps` (currently there are none) that might now be pulling a large Supabase table into the build.
3. Review `package.json`/lifecycle scripts for new long-running steps (Supabase migrations, Prisma generation, etc.) added to `prebuild`/`postinstall`/`postbuild`.
4. Inspect `lib/domain/*` for any recently added top-level side effects or external API/Stripe/Twilio initializations that could fire during module import.

### Build-time kill switches
When Vercel times out, flip one of the `DISABLE_*_FOR_BUILD` flags to `true` and rerun `npm run build`/`npm run vercel:build`. Each flag short-circuits the corresponding route (`app/calls/page.tsx`, `app/public/bookings/[slug]/page.tsx`, `app/jobs/[id]/page.tsx`, and `app/customers/[id]/page.tsx`) by exporting a tiny stub component so Supabase/Twilio/OpenAI code never executes during the compile phase. Combine a flag with `BUILD_DIAGNOSTICS=true` to surface `buildLog` traces from `next.config.ts` and `app/layout.tsx` while you do the binary search.
Keep the flags disabled for normal deploys so the real features stay online—use them only inside the Vercel build/`next build` run you are inspecting.

Keeping this document updated whenever build-time habits change should help prevent another 45+ minute Vercel timeout.
