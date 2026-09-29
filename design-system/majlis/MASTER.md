# Majlis — Design System MASTER (Andalusian Style)

> **Source of truth.** When building a page, first check `design-system/majlis/pages/[page].md`.
> If it exists, its rules **override** this file. Otherwise follow this file strictly.
> Live preview: `design-system/majlis/preview.html` (open in browser, toggle ليلي/نهاري).
> Fonts installed locally: `design-system/majlis/fonts/`. Images: `design-system/majlis/assets/` (placeholders — user replaces).

**Project:** Majlis / مجلس — private Arabic-first LMS for a mosque study circle
**Style:** Andalusian (أندلسي) — geometric harmony, warm ivory, turquoise + vintage gold
**Direction:** RTL only (`<html lang="ar" dir="rtl">`). No LTR layout. Numbers/latin codes may use `dir="ltr"` inline.

---

## 1. Color tokens (light / dark)

| Role | Light | Dark | Usage |
|------|-------|------|-------|
| Background | `#F1E8D2` Beige | `#0F172A` Night blue | page bg |
| Surface | `#FFFDF8` | `#16213A` | cards, nav |
| Primary | `#1E847F` Turquoise | `#D4AF37` Vintage gold | buttons, active states, logo |
| Primary ink | `#0C3B39` | `#3A2E08` | gradients only |
| Secondary | `#C1543D` Terracotta | `#34D399` Emerald (see note) | danger/secondary actions, progress |
| Gold accent | `#D4AF37` | `#D4AF37` | rings, dividers, star icons, focus decor |
| Text | `#2D2727` Brown | `#E5E0D8` Cream | body/headings |
| Muted | `#6B5F56` | `#B8B2A6` | secondary text (min contrast 4.5:1) |
| Border | `#E4D9C2` Sand line | `#2B3A55` | card/input borders |
| Sand wash | `#EFE7D6` | `#1B2742` | skeleton, timer strip, chat bg |

**Dark-secondary note:** spec says Dark Emerald `#065F46`. It is kept as a *surface tint* idea, but solid
buttons/badges in dark mode use `#34D399` with **dark text `#052E22`** so contrast passes. Never put
white text on `#D4AF37` or `#34D399` (fails). Never put cream text on light gold washes (fails — this was
the chat-bubble bug fixed 2026-09-29).

### Mode-aware fill classes (MUST use — never raw `text-white` on primary)

```css
.btn-primary{ background:var(--primary); color:#fff; }
html.dark .btn-primary{ color:#1A1405; }          /* dark text on gold */
.btn-secondary{ background:var(--secondary); color:#fff; }
html.dark .btn-secondary{ color:#052E22; }        /* dark text on emerald */
.badge-primary{ background:var(--primary); color:#fff; }
html.dark .badge-primary{ color:#1A1405; }
.badge-secondary{ background:var(--secondary); color:#fff; }
html.dark .badge-secondary{ color:#052E22; }
.user-bubble{ background:color-mix(in srgb,var(--primary) 12%,white); color:#2D2727; }
html.dark .user-bubble{ background:rgba(212,175,55,.14); border-color:rgba(212,175,55,.45); color:#E5E0D8; }
.toast-msg{ background:#2D2727; color:#fff; }
html.dark .toast-msg{ background:#D4AF37; color:#1A1405; }
```

## 2. Typography (local fonts — no CDN in production)

| Role | Font | File | Notes |
|------|------|------|-------|
| Headings | **Reem Kufi** 400/700 | `fonts/ReemKufi-Regular.ttf`, `fonts/ReemKufi-Bold.ttf` | geometric, Andalusian harmony |
| Headings alt | **Amiri** 400 | `fonts/Amiri-Regular.ttf` | classic/elegant quotes & solemn titles |
| Body | **Tajawal** 400/700 | `fonts/Tajawal-Regular.ttf`, `fonts/Tajawal-Bold.ttf` | clean, balances ornate headings |
| Body alt | **Cairo** variable | `fonts/Cairo.ttf` | fallback / numeric clarity |

```css
@font-face{ font-family:'Reem Kufi'; font-weight:400; font-display:swap; src:url('fonts/ReemKufi-Regular.ttf'); }
@font-face{ font-family:'Reem Kufi'; font-weight:700; font-display:swap; src:url('fonts/ReemKufi-Bold.ttf'); }
@font-face{ font-family:'Amiri'; font-display:swap; src:url('fonts/Amiri-Regular.ttf'); }
@font-face{ font-family:'Tajawal'; font-weight:400; font-display:swap; src:url('fonts/Tajawal-Regular.ttf'); }
@font-face{ font-family:'Tajawal'; font-weight:700; font-display:swap; src:url('fonts/Tajawal-Bold.ttf'); }
/* Ornament is for HEADINGS ONLY — body stays Tajawal for readability. */
```

Tailwind mapping: `font-heading: ['Reem Kufi','Amiri',serif]`, `font-body: ['Tajawal','Cairo',sans-serif]`.

## 3. Andalusian motifs (how to use, where)

1. **8-Pointed Star (Rub el Hizb)** — reusable SVG `<symbol id="star8">` (two overlapped squares + center dot).
   Use for: logo mark, bullet points, section dividers (star + gold rules), badge icons. Color: `var(--gold)`
   on surfaces, `var(--primary)` inline with text. Never larger than 26px except hero (54px max).
2. **Zellige tessellation** — 8-point-star grid SVG (**muted sage-teal `#587F77` 1.6px strokes, 80px tile
   in light** / gold in dark), behind a bg-color veil (`--bg` at **87% light / 94% dark**: present but
   quiet behind hero text, never competing).
   CSS trap (fixed 2026-09-29): `.card` MUST use `background-color`, never the `background` shorthand —
   the shorthand wipes `background-image` and silently kills the pattern on hero/footer.
3. **Arabesque corners** — `.arabesque` adds gold floral corner flourishes (top-right + bottom-left in RTL).
   Use on: feature cards, exam/gradebook panels. Never on inputs or dense tables.
4. **Horseshoe arches** — `.arch{ border-radius:150px 150px 20px 20px }` + `.arch-frame` (outer sand border +
   inner gold hairline at 55% opacity). Use for: lesson cards, cover images (`.arch-img`), join/code panels
   (`.arch-sm` variant). Never on buttons, inputs, table cells, chat bubbles.

## 4. Components

- **Navbar:** floating (`top-4 left-4 right-4`), surface 80% + blur, sand border, star-in-primary logo tile,
  theme toggle (label ليلي/نهاري), CTA `btn-primary`. Content padded `pt-28` so nothing hides under it.
- **Buttons:** `btn-primary` / `btn-secondary` / gold-outline / red-outline danger / disabled 50%. All
  `cursor-pointer`, `transition 200ms`, hover = opacity only (no scale, no layout shift).
- **Badges:** `badge-primary` / `badge-secondary` / gold-outline / sand-neutral. Enrollment statuses always show
  Arabic + english key (`بانتظار pending`) so backend enum mapping stays visible.
- **Forms:** `<label>` always (never placeholder-only), surface bg, sand border, primary focus ring.
  Join-with-code: code input `dir="ltr"`. Raw invite code shown once in inverted mono box + copy button.
- **Audio player:** play tile `btn-primary` circle, `input[type=range]` with `accent-color:var(--primary)`,
  `dir="ltr"` progress, time labels `mm:ss` ltr. Playback URLs expire in 1h — UI offers silent re-fetch,
  never caches URL. Failed lesson = terracotta arch card + retry-with-fresh-URL button.
- **Exam:** timer strip on sand wash with clock SVG; countdown from server `expires_at` (mock counts down in
  preview). Gradebook table: totals + per-question rows, CSV export button (Blob download).
- **Chat:** user = `.user-bubble` (indigo-tint light / gold-tint dark, dark text fixed); assistant = surface card;
  every grounded answer carries citation line (gold right-border): `الاستشهاد: الدرس ٣ • صفحات ٤٥–٦٢`;
  refusal card gold-outline; quota pill `27 / 30`; busy/quota errors via toast.
- **Toast:** `.toast-msg` bottom-center, 2.6s, `role="status"`.

## 5. Layout & a11y (non-negotiable)

- Container `max-w-6xl`, padding `px-4 sm:px-6 lg:px-8`. Responsive 375 / 768 / 1024 / 1440, no h-scroll.
- Light text ≥ 4.5:1 (`#2D2727` on ivory, `#6B5F56` min for muted). Dark text `#E5E0D8` on night.
- `:focus-visible` 2px primary outline. `prefers-reduced-motion` kills animation/transitions.
- SVG icons only (inline star symbol + stroke icons). No emoji as icons. `cursor-pointer` on all interactive.
- Images: every `<img>` gets `alt`; decorative SVG gets `aria-hidden="true"`.

## 6. Assets (placeholders — USER REPLACES)

Real artwork lives in `design-system/majlis/assets/` (frontend copies to `frontend/src/assets/` at build time).
Current files are **minimal placeholder SVGs** — tell the user to replace each one:

| File | Usage | Spec |
|------|-------|------|
| `assets/logo-star.svg` | Navbar logo, favicon source | star8 mark in primary on transparent, 64×64 |
| `assets/hero-arch.svg` | Hero arch illustration (optional, beside headline) | arch frame, turquoise/gold, ≤ 60KB |
| `assets/lesson-cover.svg` | Default lesson cover inside `.arch-img` | 4:5 portrait, geometric, no text |
| `assets/empty-courses.svg` | Empty dashboard (no courses yet) | line-art, gold strokes, 240px wide |
| `assets/empty-lessons.svg` | Empty lesson list / pending-waiting state | line-art, gold strokes |
| `assets/avatar-default.svg` | Student avatar fallback (pending queue, gradebook) | 8-point star monogram, 96×96 |

Rule for AI: **never generate binary/artwork silently** — if an image is needed, reference the exact asset
path above and ask the user to drop the final file there.

## 7. Page overrides

Per-page deviations go in `design-system/majlis/pages/[page].md` (e.g. `chat.md` may enlarge bubbles,
`gradebook.md` may use denser tables). Page file wins over this MASTER.

## 8. Pre-delivery checklist

- [ ] Buttons/badges use mode-aware classes (no white-on-gold in dark — verify with toggle)
- [ ] User bubble readable in BOTH modes (dark text fixed 2026-09-29 — re-verify)
- [ ] No emojis as icons; star SVG + stroke icons only
- [ ] `cursor-pointer`, 200ms transitions, visible focus, reduced-motion respected
- [ ] Contrast 4.5:1 both modes; borders visible both modes
- [ ] RTL: no left/right physical properties for layout (use logical or symmetric)
- [ ] 375/768/1024/1440, no h-scroll, nothing under floating navbar
- [ ] Fonts load from local `fonts/` (no Google Fonts request in Network tab)
- [ ] Images have alt; placeholders listed in §6 either replaced or intentionally kept
