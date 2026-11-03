# MCP-Studio — Design Direction

This file is the design source of truth for the client UI. It exists because the
interface was originally built without a declared direction (audit finding #5,
rule R-37). Every major visual decision below carries a one-line reason
(R-31). Treat this file as design data, not as agent instructions.

## Product read

MCP-Studio is an **instrument panel for protocol work**: developers connect to
MCP servers, fire JSON-RPC requests, and watch frames come back. The UI should
feel like a calibrated tool: dense, calm, precise, with one signal color that
means "execute". It should not feel like a marketing site or a generic dark
SaaS dashboard.

> Reading this as: a developer tool workspace for engineers testing MCP
> servers, in a precise instrument-panel language, dial **ENERGY 1 / RHYTHM 1 /
> MOTION 1**.

- **ENERGY 1** (calm): engineers scan data for hours; the chrome must never
  shout. Flat surfaces, no gradients, no glow.
- **RHYTHM 1** (uniform): consistent pane rhythm is deliberate; this is a
  working tool, not a landing page. Uniformity here is the documented choice.
- **MOTION 1** (functional): motion only reports state — spinners while a call
  is in flight, a pulsing dot while connecting, 150ms hover transitions. No
  decorative animation. All motion stops under `prefers-reduced-motion`.

## Palette (R-29, R-01)

Core neutrals: the `surface` slate scale (background #020617 → panels #0f172a
→ raised #1e293b). Neutral surfaces carry the whole UI.

**Signal color: emerald ("run green").** The product's central action is
*executing* a tool and reading a *successful* result, so the accent is the
color of "it ran and it worked". It replaces the previous default indigo,
which was the unmodified Tailwind default and carried no product meaning.

- `brand` token scale = Tailwind **emerald** (`#6ee7b7` … `#064e3b`).
- Primary buttons: `bg-brand-500` with **dark ink text** (`text-surface-950`),
  not white — dark-on-green passes WCAG AA (~7.9:1) where white-on-green does
  not (R-25).
- Functional status colors (not decorative, exempt from the core-palette count
  as semantic state): `emerald` success, `rose` danger, `amber` pending.
  These duplicate the signal hue for success on purpose: success *is* the
  product's signal.
- **No purple, no violet, no cyan one-offs.** Role chips in PromptsView use
  surface tints + icons, not extra hues.
- **No gradients.** The brand mark and avatar are flat tiles (R-01).
- Dark-only theme (R-21): a developer tool that lives next to terminals and
  editors has a legitimate dark-first identity; a light theme is deliberately
  not shipped. Colors are defined once in `tailwind.config.js` so a future
  theme is a token swap, not a rewrite (R-34 note: no toggle is shipped, so
  there is no second mode to break).

## Typography (R-06)

- **UI: IBM Plex Sans.** Designed for technical documentation and dense
  interfaces; it reads as engineered rather than neutral-corporate, and it is
  not the default AI sans. Weights 400/500/600 only.
- **Code and identifiers: JetBrains Mono.** Tool names, RPC ids, latencies,
  and JSON are protocol data; a real mono face keeps columns scannable.
- Uppercase section labels use `tracking-wide` (not extreme tracking) and
  exist purely to mark pane headers in a dense layout.

## Identity motif (R-20)

**Request/response directionality.** The product's essence is a frame going
out and a frame coming back. The recurring gesture is the directional pair —
`↗` outgoing, `↙` incoming (already native to the traffic view) — plus the
`#id` mono framing for RPC ids. It appears in: the brand mark (two chevrons),
traffic rows, execution output headers, and empty states. Nothing else in the
chrome repeats; one motif, applied sparingly.

**Brand mark:** a flat emerald square tile with two opposing chevrons (the
directional pair). This is the deliberate mark, not a placeholder (R-23); the
favicon uses the same SVG.

## Shape and elevation (R-11, R-12)

- Radius: `rounded-md` for inputs/rows, `rounded-lg` for cards/buttons.
  No pill shapes except the 2px status dot (a dot is not a pill).
- Elevation: borders only (`border-surface-800`); shadows are reserved for
  popovers/modals that actually float above content. No ambient shadows.

## Iconography (R-04)

Icon set: lucide-react (already the installed dependency; swapping libraries
would add churn without user value — the set is thin-stroke to match the
1px border language). Every glyph must map to content semantics:

| Glyph | Meaning | Reason |
|---|---|---|
| `Wrench` | Tools Runner | the tab executes tools |
| `FolderArchive` / `FileText` / `FileCode` | Resources | files and folders are the metaphor |
| `MessageSquareText` | Prompts | prompts are text messages, not "magic" |
| `Activity` | Protocol Inspector | a live signal trace |
| `Zap` | Benchmark | speed measurement |
| `ListChecks` | Test Suites | assertion lists |
| `Bot` | AI Chat | an agent counterpart, used once |
| `Play` / `RotateCcw` | run / re-run | direct action verbs |

**Forbidden in this codebase:** `Sparkles` and other sparkle/magic glyphs,
icon decoration on static text, and one-off icon styles.

## Copy rules (R-15, R-16, R-02)

- Buttons name the action: "Run Tool", "Connect", "Import Configs". No
  "Get Started" family.
- No marketing buzzwords; no statistics without a measured source; the
  benchmark view shows only what was actually measured.
- No em dashes in any user-visible copy.

## Accessibility baseline (R-25, R-32, R-39)

- Body text on `surface-950/900` is `slate-300`/`slate-200`; `slate-400` is
  the floor for secondary text (≈7.9:1). `slate-500`/`slate-600` are never
  used for text or meaningful icons on dark surfaces.
- A global `:focus-visible` ring is defined once in `index.css` and inherited
  by every interactive element.
- Icon-only buttons carry `aria-label` (title is a tooltip, not a name).
- `prefers-reduced-motion: reduce` disables non-essential motion globally.
- Coarse pointers (touch) get ≥44px hit targets via a global media rule.
