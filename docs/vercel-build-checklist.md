## Vercel Build Checklist

- **Scripts Vercel should run**
  - `npm install`
  - `npm run build` (currently `next build` only)

- **Guarded or disabled scripts**
  - No `postinstall`, `preinstall`, or `prepare` hooks exist that start Supabase, dev servers, or other heavy tasks.
  - No Husky or lint-staged setup is installed during the build, so no Git-hook wiring runs on Vercel.

- **Strict prohibitions**
  - Vercel builds must not run tests.
  - Vercel builds must not start local databases or long-lived processes.
  - Any heavy tasks should run in CI, not in the Vercel build.
