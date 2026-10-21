---
name: "@vkma.dev/devtools"
description: The Dialogue Axis — a quiet gray/black/white devtools instrument where the bridge conversation itself is the interface.
colors:
    page: "oklch(98.5% 0 0) / dark: oklch(14.5% 0 0)"
    surface: "#ffffff / dark: oklch(21% 0 0)"
    ink: "oklch(14.5% 0 0) / dark: oklch(98.5% 0 0)"
    muted: "neutral-500 / dark: neutral-400"
    hairline: "neutral-200 / dark: neutral-800"
    positive: "emerald (500 indicator, 600/30 borders)"
    negative: "red (500 indicator, 500/30 borders)"
    warning: "amber (500 indicator, 500/30 borders)"
typography:
    ui: "ui-sans-serif, system-ui stack — committed choice, not fallback"
    data: "ui-monospace stack for event names, payloads, timestamps, ids"
    scale: "14 base, 13 secondary, 12 names, 10-11 metadata"
rounded:
    control: "0.375rem"
    card: "0.5rem"
spacing:
    row: "py-1.5 dense timeline rows (~32px)"
    control: "28px controls, 32px inputs"
---

# Design System: @vkma.dev/devtools

## Overview

**Creative North Star: "The Dialogue Axis"**

The panel is a quiet instrument in the @pajecawav/ui lineage ("The Quiet
Instrument"): pure neutral ramp, near-black ink as the only primary, the
platform typeface, and color appearing exactly when meaning appears —
emerald for a resolved response, red for an error, amber for a trust
problem. What makes it itself is the timeline's center hairline: outgoing
sends speak from the right of the axis, incoming events and paired
responses answer from the left, so the app↔VK conversation reads as a
dialogue, not a log. The axis collapses to direction chips under 640px
(the FAB overlay on a phone keeps full function).

## Key Characteristics

- Neutral-only shell; semantic accents never decorate.
- One control grid: 28px buttons, 32px inputs, 6px control radius.
- Monospace is for data (names, payloads, timestamps with tabular
  numerals), never costume.
- Metadata (timestamps, client badges) at 10px neutral-500/400 — sized
  for scanning, contrasted for AA.
- Light and dark are both composed; `prefers-color-scheme` default with
  a persisted toggle; theme set pre-paint (no flash).
- One authored motion: rows surface from 4px below (160ms, ease-out),
  disabled under `prefers-reduced-motion`.

## Components

- **TopBar** — wordmark (authored diamond SVG), connection status dot +
  label, theme toggle.
- **Rail** — icon+label nav (Timeline / Execute / Clients); left column
  ≥640px, bottom bar below.
- **Timeline** — filter row (search, All/In/Out segmented control, pause,
  clear) over the dialogue axis; rows carry time, client badge, paired
  duration (`↳ 42ms`), ok/error marks; payload expands inline with copy.
- **Execute** — target select, event datalist input, JSON params with
  live validation, result panel (tonal emerald/red/amber at 6% opacity).
- **Clients** — expandable registry cards: platform icon, short id, url,
  launch params grid, bridge-missing warning.

## Icons

Authored set, one stroke weight (1.75), round caps, 24-box at 16px —
diamond wordmark, direction arrows, platform glyphs, sun/moon, transport
controls. No unicode stand-ins.
