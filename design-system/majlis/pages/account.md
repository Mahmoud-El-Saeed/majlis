# Account page override (`/account`)

> This file wins over `MASTER.md` where they disagree (ticket 18 language pilot).

## Direction pilot ( overrides MASTER §Direction + §5 RTL )

- MASTER says RTL-only, no LTR layout. This page is the **bilingual pilot**: when the user
  picks English (`mj_lang=en`), `<html dir>` flips to `ltr` (via `LangProvider` + the
  pre-paint script in `frontend/index.html`, so no direction flash).
- Every other page stays Arabic RTL until the full-EN follow-up restructures `i18n.ts`
  into per-language dictionaries (tracked, not built).
- LTR-specific rules for this page only:
  - `.arabesque` corners mirror (`index.css` `html[dir="ltr"]` block) so the flourish never
    covers left-aligned labels.
  - All layout uses logical properties; no physical `left/right` for positioning.
  - `dir="ltr"` inline persists for email / codes / timers in both languages.

## Unchanged MASTER rules

Tokens, mode-aware fills (dark text on gold/emerald), contrast ≥ 4.5:1, `cursor-pointer`,
200ms transitions, visible focus, `prefers-reduced-motion` static, SVG-only icons, local fonts.
