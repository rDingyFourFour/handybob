This repository is a single-package Next.js App Router project;  
HandyBob is not part of a larger monorepo, so Vercel builds the repo root itself.

**Vercel settings (default)**
- **Project root:** `/Users/roeyshmool/VST/handybob` (the repo root). There is no `vercel.json`, so the UI uses this directory automatically.
- **Framework preset:** Next.js (App Router — server components + API routes).
- **Build command:** `npm run build` → `next build`.
- **Install command:** `npm install`.
- **Output directory:** Default `.next` (Vercel reads the standard Next.js build output).

If you ever split this repo into multiple packages, add `vercel.json` or UI overrides so the Vercel root/`rootDirectory` only points at the Next.js app; for now the default settings already match the app root.
