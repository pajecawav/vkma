# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro 7, hand-built — no Starlight; a private workspace app in `apps/docs/` whose
static output is served by Cloudflare Workers static assets. Markdown runs through
`unified()` with two in-house plugins (code figures with Shiki inside; prose
touches), search is Pagefind with one index per language.

## Users

JS/TS developers building a VK Mini App (React + Vite, often VKUI) who arrive
with a concrete task — send a bridge event, wire the router, deploy — and want
the exact answer plus a snippet, fast. Finding the answer matters more than
beauty. Russian is the root locale, English is a full mirror. AI clients read the
same pages as Markdown (`/foo.md`, `llms.txt`).

## Product Purpose

Document the `@vkma.dev/*` packages so a developer can install, use, configure
and ship them without reading the source. Success: the reader finds the page and
the snippet in seconds, copies a command that works for their package manager,
and moves on.

## Positioning

An independent VK Bridge plus typed event and API schemas and devtools,
documented as plain Markdown that doubles as the machine-readable source
(byte-exact `.md` endpoints, `llms.txt`, `llms-full.txt` are built from the same
files).

## Operating Context

- The reader has an editor and a terminal open; copies shell and TypeScript
  snippets; moves between the pages of one package and across packages.
- Package managers vary — npm, pnpm, yarn, bun. The docs already list the
  alternatives in a `# или: pnpm add / yarn add / bun add` comment; the site
  turns that comment into tabs.
- Both light and dark themes are first-class; the theme follows the system by
  default, is set before the first paint and is remembered per browser.
- Entry points: search engines, npm and GitHub links, the in-package READMEs,
  AI clients fetching `.md`.

## Capabilities and Constraints

- Content is plain `.md` only — no MDX, no components, no raw HTML. Frontmatter:
  `title`, `description`, `sidebar.order`, `sidebar.label`.
- 38 pages per locale plus a 404 page. Packages are top-level sidebar groups in
  the order `sections.mjs` defines once; llms.txt reads the same file.
- Unchanged by any redesign and pinned by `tests/`: byte-exact `.md` copies,
  `llms.txt` / `llms-full.txt` per locale, the sitemap, `robots.txt`, `_headers`,
  the OG card, the Cloudflare static deploy.
- Search covers both locales; Russian must stay searchable.
- Code blocks are the most-read content: shell commands get a package-manager
  switch, source blocks get a file-name header. The chrome is derived at build
  time from the content's own conventions; the Markdown stays plain.
- The home page `/` is the getting-started document; whether it becomes a
  designed landing is an open decision.

## Brand Commitments

- The Diamond-V glyph — a dark `#111` tile with a white mark — is the favicon
  and the wordmark of the devtools panel.
- Inter and Geist Mono, self-hosted via Fontsource, Cyrillic included.
- VK blue `#0077FF` is the single accent. For text the site uses the AA-safe
  `#005FF8` on white and `#71AAFF` on the dark ground.
- White ground, hairlines, neutral greys, one centred island of content — the
  look the owner picked from a referenced technical explainer.

## Evidence on Hand

- 76 real documentation pages (ru + en) in `src/content/docs/`.
- `public/og.png` rendered from `scripts/og.html`; `public/favicon.svg`.
- No screenshots of the devtools panel inside the docs today. The site invents
  no claims: the package index on the home page restates that page's own table.

## Product Principles

1. The answer first: the reading column stays calm; the reader came with a task.
2. Code is the hero: snippets are set with care and copy cleanly.
3. One accent; colour only where it means something (current page, active tab,
   links, focus).
4. A quiet frame: hairlines over boxes, chrome that recedes.
5. Markdown is the source of truth; anything the site adds is derived at build
   time.

## Accessibility & Inclusion

Body and secondary text at or above 4.5:1 in both themes; the search dialog, the
navigation drawer and the package-manager tabs follow the WAI-ARIA patterns;
without JS every code variant stays visible and the navigation is native
`<details>`. The page is kept clean under axe-core (WCAG 2.0 and 2.1 A+AA,
best-practice) on representative pages in both themes.
