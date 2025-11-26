## Turbopack CSS panic notes

- **Location**: `[project]/app/globals.css` (app-client CSS module)
- **Symptom**: Turbopack insists on creating a new process/binding to a port while processing the CSS asset (per `next-panic-1f2bee2e...`.log).
- **Follow-up**: consider simplifying PostCSS/Tailwind layers or forcing Webpack, as seen in the panic log; the problem happens before any job routes are evaluated.
- **Location**: `[project]/app/globals.turbo-test.css` (app-client CSS module)
- **Symptom**: even the truncated CSS still triggers the same “binding to a port” panic in Turbopack (`next-panic-8a8c2d...`). The panic is still in the CSS pipeline before any JS routes load.

## Status

- Webpack builds (`TURBOPACK=0 next build`) are stable and remain HandyBob’s canonical build path.
- Turbopack builds (`next build` without `TURBOPACK=0`) repeatedly fail inside Tailwind’s PostCSS pipeline (unknown utilities + port-binding panic), so we treat this as a tooling bug until it is resolved.
