---
name: "@vkma.dev/devtools"
description: A quiet gray/black/white devtools instrument where the bridge traffic reads as requests, responses and events.
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
    row: "28px timeline rows, responses indented 36px"
    control: "28px controls, 32px inputs"
---

# Design System: @vkma.dev/devtools

## Overview

**Creative North Star: "The Quiet Ledger"**

The panel is a quiet instrument in the @pajecawav/ui lineage ("The Quiet
Instrument"): pure neutral ramp, near-black ink as the only primary, the
platform typeface, and color appearing exactly when meaning appears —
emerald for a resolved response, red for an error, amber for a trust
problem. The timeline is a ledger of transactions: each app request is a
28px row (`→` chip, mono method, inline payload preview) with its response
nested beneath it (`↩` chip, round-trip duration, ok/error mark);
unsolicited VK events stand alone (`◇` chip). There is no left/right
dialogue and no in/out vocabulary — the model is request / response /
event, matching the wire.

## Key Characteristics

- Neutral-only shell; semantic accents never decorate.
- One control grid: 28px buttons, 32px inputs, 6px control radius.
- Monospace is for data (names, payloads, timestamps with tabular
  numerals), never costume.
- Metadata (timestamps, client badges, durations) at 10px neutral-500/400
  — sized for scanning, contrasted for AA.
- Light and dark are both composed; `prefers-color-scheme` default with
  a persisted toggle; theme set pre-paint (no flash).
- One authored motion: rows surface from 4px below (160ms, ease-out),
  disabled under `prefers-reduced-motion`.

## Components

- **TopBar** — wordmark (authored VK Mini Apps logo SVG), connection
  status dot + label, theme toggle; embedded panels show a colored client
  badge left of the status.
- **Rail** — icon+label nav (Timeline / Execute / Clients); left column
  ≥640px, segmented top bar below (the panel lives in small overlays).
  Embedded panels drop the Clients entry.
- **Timeline** — filter row (search, All/Requests/Events segmented
  control, client switcher once more than one client is connected, pause,
  clear) over the ledger: request groups with nested responses,
  standalone event rows, payload expands into a JsonTree with copy.
- **Execute** — target select (hidden in embedded mode), event datalist
  input, JSON params with live validation, result panel (tonal
  emerald/red/amber at 6% opacity) with a collapsible JsonTree that grows
  on large screens.
- **JsonTree** — Chrome-DevTools-style collapsible viewer on CSS modules:
  colored keys/strings/numbers/booleans/null (DevTools light palette,
  Catppuccin dark), collapsed containers preview their first entries
  inline (`{ key : {…}, count : 42 }`), arrays get a length row, children
  chunk by 500 with "show more". All nodes memoized.
- **Clients** — expandable registry cards: platform icon, colored short
  id, url, launch params grid (sensitive params blurred:
  sign/access_token/auth_key/sid), bridge-missing warning.

## Icons

Authored set, one stroke weight (1.75), round caps, 24-box at 16px —
diamond wordmark, request arrow, response return arrow, event diamond,
platform glyphs, sun/moon, transport controls. No unicode stand-ins.
