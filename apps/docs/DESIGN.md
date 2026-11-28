---
name: "@vkma.dev/docs"
description: A paper-white reference where a hairline header and one centred island of navigation, column and contents frame a calm reading column; VK blue appears only where it means something.
colors:
    page: "#ffffff / dark: #17181c"
    subtle: "#fafafa / dark: #1e1f24"
    ink: "#141417 / dark: #ededf0"
    muted: "#55555e / dark: #a3a3ad"
    faint: "#6f6f7b / dark: #8b8b96"
    hairline: "rgba(20,20,23,.10) / dark: rgba(237,237,240,.10)"
    accent: "#0077ff — markers and fills; text #005ff8 light / #71aaff dark"
    code: "#f7f7f8 / dark: #1c1d23"
typography:
    text: "Inter Variable (wght + opsz, Fontsource) — UI 14, secondary 13, meta 12, body 16/1.7 at 62ch, lede 18, h1 36/600/−0.028em, h2 21/600"
    data: "Geist Mono Variable — code 13.5/1.7, inline code .875em, package ids 13"
rounded:
    control: "6–8px"
    code: "8px"
layout:
    island: "216 + 24 + 720 + 56 + 232 = 1248px, centred; the header content aligns to it"
    header: "56px, hairline bottom, 92% page colour + blur, sticky"
    breakpoints: "1340px contents fold away; 1024px navigation moves to a drawer; 899px compact header"
---

# Design System: @vkma.dev/docs

## Overview

**Creative North Star: "The Quiet Sheet"**

The documentation is a sheet of paper with rules, not boxes. Everything the
reader came for sits in one centred island — navigation, column, contents —
under a single hairline header. The frame is drawn with 1px rules; colour enters
only when it carries meaning: the page you are on, the section you are reading,
the tab you chose, a link. The reader is a developer with a task; the page's job
is to get out of the way of the answer.

## Key Characteristics

- One accent (VK blue) for state: the current page, the active contents entry,
  the active package-manager tab, links, focus rings. Never decoration.
- Hairlines over boxes: the header, the article head, tables, the package index
  and the contents rail are all 1px rules.
- Measure: prose at 62 characters; code and tables take the full 720px column.
- Monospace is for data — code, package identifiers in the navigation, keyboard
  keys. Page names are set in Inter.
- Light and dark are both composed. The theme follows the system by default, is
  set before the first paint and is remembered per browser.
- No entrance animation. Motion answers actions only: the drawer slides, a
  copied button turns into a check, the contents marker follows the scroll.
- Without JS the document is complete: every code variant is visible, the
  navigation is native `<details>`, the contents are plain anchors.

## Frame

- **Header** — the wordmark (Diamond-V tile and `vkma.dev`) on the left; the
  search field, language, theme and GitHub on the right. Its content aligns to
  the island: the wordmark sits over the navigation text, the controls end over
  the contents.
- **Navigation** — one link to the start page, then one collapsible group per
  package: the package id in Geist Mono, a chevron at the row end, the pages
  inside in Inter. The current page gets a 2px accent bar in the row's gutter.
  The current page's group is open on arrival; groups a reader opened stay open
  for the tab, in the island and in the drawer alike.
- **Contents** — `На этой странице` as a quiet rail: every entry hangs on a
  shared 1px vertical rule; the entry in view turns to ink and its segment to
  accent. The edit link sits under the list. Under 1340px it folds into a
  `<details>` under the article head.
- **Article head** — the h1, the description as a lede, a hairline. On the start
  page the h1 is 44px and the lede is omitted (the opening paragraph says it).
- **Paginator** — a hairline, then previous and next with a 12px direction label
  and the page's sidebar name.
- **Small screens** — under 1024px the navigation moves into a left drawer
  (`<dialog>`) that opens on the current page; under 899px the header compacts
  the search field into its icon.
- **Print** — the article alone, full width, in light ink whatever the screen
  theme says; external links print their URL.

## Code

A block is a figure with a 1px rule and an 8px radius on the code ground. Its
header carries either a file (a type tile, a dimmed directory, the file name) or
a package-manager tab row whose active tab is attached to the code below it;
the copy button is the header's last item. Plain blocks have no header — the
copy button appears on hover and never overlaps the first line. Syntax keeps to
one calm palette in both themes: keywords and constants in accent blue, strings
in green, types and functions in violet, punctuation grey, comments grey italic;
comments and punctuation stay at or above 4.5:1 on the code ground.

## Icons

An authored set with one stroke weight (1.75), round caps, a 24-box drawn at
16px: search, sun, moon, chevron, copy, check, pencil, menu, close, arrows,
anchor. No unicode stand-ins.
