CSS Style Architecture Summary

This summary treats `app/globals.css` as the live reference for HandyBob mobile styling while we collect facts about ownership, selectors, and tokens. Pixel should treat this document as the canonical map for future parity work until we safely modularize.

## High-level layering model
Tailwind ships all base/component/utility layers first, so our overrides in `app/globals.css` are always the final authority for HandyBob-specific visuals. The file keeps a single `:root` section that defines base tokens, and everything inside `.hb-mobile-theme` layers mobile overrides on top; that means tokens such as `--theme-card` and our mobile variants like `--hb-mobile-home-gutter-x` live in the same file so Tailwind layering does not surprise future rules. We continue to use globals.css because it is the only location that can currently reach the mobile shell (`div[data-testid="mobile-shell"]`) and its descendants reliably without Tailwind class collisions or build-time refactors.

## Scopes and ownership
Top-level scopes today are the global `:root` token definitions, the `html`/`body` resets, the `.hb-mobile-theme` overrides for the entire shell, and the component-ish blocks under `.hb-mobile-theme` that touch home headers, cards, CTAs, and the tab bar.

Ownership list:
- Mobile Shell  
  Primary selector/hook: `.hb-mobile-theme.hb-mobile-shell` plus `main.hb-mobile-shell-content`.  
  Primary tokens: `--hb-mobile-bottom-nav-total-height`, `--hb-mobile-bottom-nav-pad-y`, `--hb-mobile-home-gutter-x`, `--hb-mobile-vh-visual`.  
  Single owner rule: let the shell wrapper own height/overflow/padding so nothing else injects competing values on `div[data-testid="mobile-shell"]` or `main.hb-mobile-shell-content`.
- Mobile Home  
  Primary selector/hook: `.hb-mobile-theme .mobile-home`.  
  Primary tokens: `--hb-mobile-home-stack-max-width`, `--hb-mobile-home-bg`, `--hb-mobile-home-rhythm-y`, `--hb-mobile-home-header-to-card`.  
  Single owner rule: guard the home container’s width/gap/overflow here; downstream cards or CTAs should only adjust their own padding.
- Cards  
  Primary selector/hook: `.hb-mobile-theme div[data-testid="mobile-home-recommendation-card"]` and `.hb-mobile-theme .mobile-home-reassurance-card`.  
  Primary tokens: `--hb-mobile-home-card-pad-top`, `--hb-mobile-home-card-pad-x`, `--hb-mobile-home-card-pad-bottom`, `--hb-mobile-home-reassurance-pad`, `--hb-mobile-home-card-border`.  
  Single owner rule: these selectors own their padding/box-sizing/overflow so no other rule sets padding on the same `data-testid` nodes.
- CTA  
  Primary selector/hook: `.hb-mobile-theme .mobile-home .hb-mobile-primary-cta`.  
  Primary tokens: `--hb-mobile-home-cta-height`, `--hb-mobile-home-cta-padding-inline`, `--hb-mobile-home-cta-radius`, `--hb-mobile-home-cta-shadow`.  
  Single owner rule: only this button rule touches CTA padding/width so Tailwind utilities do not create conflicts.
- Tab Bar  
  Primary selector/hook: `[data-testid="mobile-tab-bar-wrapper"]` and `[data-testid="mobile-tab-bar"]`.  
  Primary tokens: `--hb-mobile-bottom-nav-total-height`, `--hb-mobile-bottom-nav-item-gap`, `--hb-mobile-bottom-nav-label-size`, `--hb-mobile-home-gutter-x`, `--hb-mobile-bottom-nav-icon-size`.  
  Single owner rule: the wrapper and nav selectors own height, padding, and overflow; do not layer another height/padding rule from elsewhere.
- Office Menu  
  Primary selector/hook: `[data-testid="mobile-tab-office-menu"]`.  
  Primary tokens: `--hb-mobile-home-gutter-x`, `--hb-mobile-bottom-nav-total-height`.  
  Single owner rule: this fixed viewport layer owns its positioning so the menu can overlay without being clipped by the wrapper.

## Variable consumption map (what actually drives colors)
Tailwind class names such as `bg-[var(--mobile-card-bg)]` or `text-[var(--color-text-primary)]` are the surface hooks that the runtime DOM consumes, so updating tokens only helps once the variables those utilities read are also overridden in the same scope. Future palette changes must begin with DevTools → Computed → Variables to confirm which `--` names the node actually references before touching tokens or selectors.

### Cards
Recommendation and reassurance cards use shared utilities like `bg-[var(--mobile-card-bg,var(--theme-card-bg))]`, so the surface inherits `--mobile-card-bg` (and its alias chain `--hb-mobile-home-card-bg`/`--hb-mobile-home-recommendation-card-bg`) instead of any ad hoc background declaration. Copy inside the card reads `--color-text-primary` and `--color-text-secondary`, and the title pulls `--hb-mobile-home-instruction-title-color` before any explicit `color` rule. When the recommendation card was inverted, the CTA selector already overrode the CTA variables, but the surface and heading kept reading the old shared names, so the fix was to override those exact variables inside `div[data-testid="mobile-home-recommendation-card"]` (including the title-color variable) so the Tailwind utilities automatically picked the updated palette.

### Mobile Home
The home container itself and its CTAs rely on the same computed variables (`text-[var(--color-text-primary)]`, `bg-[var(--theme-card-elevated)]`, etc.), so any new palette must rebind the variables the selectors consume rather than scattering new selectors elsewhere. If a heading still renders the wrong color after a palette tweak, search for a title-color variable or selector that pins that color (for example `--hb-mobile-home-instruction-title-color`) and treat that selector as the explicit owner that must be overridden in scope. This ensures the existing Tailwind-driven surface and text utilities stay in sync with the token chain.

## Known failure mode: token defined but not consumed
We added recommendation-specific tokens, but the rendered card still read the shared component variables until we overrode those names. The CTA inversion worked because its selector directly targeted the CTA and the CTA variables it consumes, while the card surface, copy, and heading kept drawing from the pre-existing `--mobile-card-bg`, `--color-text-*`, and `--hb-mobile-home-instruction-title-color` chain.

Corrective rule: when inverting or re-tinting a surface, prefer overriding the consumed variables inside the surface scope (for example the `data-testid` block that already owns the card) so the existing Tailwind utilities keep picking up the palette. Avoid painting `background-color`/`color` directly unless the component is explicitly documented as owning those properties or it is not variable-driven, and always align overrides with the token definitions the scope owns.

## Token strategy
Spacing, color, and typography values must be token-driven when possible. If a Mobile Home spacing or text change is requested, default to editing `.hb-mobile-theme` tokens such as `--hb-mobile-home-header-gap`, `--hb-mobile-home-card-pad-*`, or `--hb-mobile-home-title-line-height` before writing new selector overrides. Mobile-only tokens (the `--hb-mobile-*` set) are safe to adjust directly because they live in the mobile scope, but global tokens like `--theme-card` or `--theme-primary` should remain stable unless a brand-wide change is approved. If a property cannot move to a token safely (e.g., a one-off layout tweak), document “verify in repo” and include a justification in the parity memo so the remaining selector rules are explicit about their scope.

Global “theme green” updates now flow through the primary token chain (desktop/root definition plus the `.hb-mobile-theme` override) and point to `#008000`. Anyone requesting a green palette change must start by updating the appropriate `--theme-*` token and then overriding any downstream `--hb-mobile-*` alias rather than sprinkling `background-color: #008000` or similar values into surface selectors. Every element already marked as green should inherit from that token chain so we avoid hard-coded duplicates or orphaned selectors.

## Selector strategy
Prefer stable hooks such as `data-testid` attributes or bespoke classes when the component already exposes them. Do not invent fragile selectors in globals.css; otherwise scope rules under `.hb-mobile-theme` plus the existing structural classes (for example, `.mobile-home header` or `.mobile-home .hb-mobile-primary-cta`). Current hooks we rely on are `data-testid="mobile-shell"`, `data-testid="mobile-shell-content"`, `data-testid="mobile-home-header"`, `data-testid="mobile-tab-bar-wrapper"`, `data-testid="mobile-tab-bar"`, `data-testid="mobile-tab-office-menu"`, and `data-testid="mobile-home-recommendation-card"`. Always verify the runtime DOM ancestor chain in DevTools before writing selectors so you do not accidentally target a different subtree (e.g., confirm `div[data-testid="mobile-tab-bar-wrapper"]` is still the fixed wrapper before applying a new rule).

## Overflow and viewport invariants
Maintain these invariants: no horizontal overflow (scrollWidth minus clientWidth should stay ≤1px), the fixed bottom nav must not push the layout wider, and dropdowns like the office menu must overlay content without being clipped. The known failure mode was the Office menu living inside `[data-testid="mobile-tab-bar-wrapper"]` with `overflow: hidden`; moving the menu to a fixed viewport layer (`[data-testid="mobile-tab-office-menu"]`) solved the clipping while preserving the gap from the right gutter. Allowed tools: `box-sizing: border-box`, `min-width: 0`, `max-width: 100%`, `overflow-x: hidden`, and `overflow-y: visible` only where intentional. Avoid setting `width: 100vw` on inner nodes, pairing padding and width without `box-sizing: border-box`, or adding accidental ring offsets that hit the viewport edge.

## How Pixel should request changes
Checklist for every parity memo: specify the exact element (selector plus `data-testid` if available), name the property to change (padding/margin/line-height, etc.), state where ownership lives (token or single selector), supply DevTools proof of the computed value on that element, and respect the “no new authority” rule (do not add a second competing padding or overflow rule). Do: call out the token to be tweaked or the single selector responsible. Don’t: rely on a Tailwind utility that sits below our global rule or spray new selectors in unrelated scopes.

Additional checklist items: include the computed variable source of truth—list the specific CSS variables the element reads for background, text, and title (from Computed → Variables), not just the visual result. If a heading is still the wrong color after a palette change, search for a title-color variable or selector that pins title color and treat it as the explicit owner that must be overridden in scope.

Examples based on recent work:
- MH-01 padding ownership fix: the recommendation card padding is owned by `.hb-mobile-theme div[data-testid="mobile-home-recommendation-card"]` using `--hb-mobile-home-card-pad-*` tokens, so any padding-only request should update those tokens and cite the owner in the memo.  
- Tab bar Office menu overlay: the menu now lives in `[data-testid="mobile-tab-office-menu"]`, so a parity request for its right gutter or overlay behavior must talk about that fixed layer, reference `--hb-mobile-home-gutter-x`, and avoid bundling a new rule inside `[data-testid="mobile-tab-bar-wrapper"]`.

## Incremental modularization roadmap
Next safe steps without touching runtime code today: first, create a dedicated section or tokens file (still imported by globals.css) that groups the `--hb-mobile-*` definitions so we know which tokens are mobile-only. Second, move each scope block (shell, home, cards, tab bar, office menu) into either CSS modules or `@layer components` while keeping the `.hb-mobile-theme` prefix so the rules are still scoped; each block should continue to claim single-source ownership for its surface. Third, when one surface is stable, consider extracting its token edits into a shared token module that other layers can import, but keep the entire workflow incremental and anchored to `app/globals.css` until we have full parity coverage.
