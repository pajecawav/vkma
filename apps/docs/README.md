# @vkma.dev/docs

The [vkma.dev](https://vkma.dev) documentation site: a hand-built Astro 7 site (no
Starlight), ru (root locale) + en (`/en`), deployed to Cloudflare Workers static
assets via Workers Builds.

`pnpm build` is `astro build --force` → `pagefind --site dist` → `scripts/ai-endpoints.mjs`,
which adds (`--force` clears the content cache, which does not watch the Markdown
plugins), byte-exact `.md` copies of every page plus `llms.txt` / `llms-full.txt`.
`tests/` pins that contract, the SEO head and the code chrome; run a build before
`pnpm test`.

## Layout

- `astro.config.mjs` — the Markdown pipeline (`unified()` plus the two in-house
  plugins below), the sitemap, the `nested404` integration.
- `sections.mjs` — the package order; the sidebar and llms.txt both read it.
- `src/content.config.ts` — the `docs` collection: glob loader, frontmatter schema.
- `src/pages/[...slug].astro` — every page; `404.astro` and `en/404.astro` — the 404s.
- `src/layouts/Base.astro` — `<head>` (SEO, hreflang, the theme set before the first
  paint) and the page script.
- `src/components/` — Header, Nav, Toc, Paginator, Search, MobileMenu. Thin on
  purpose: `.astro` files are not type-checked in this repo, the logic lives in `src/lib`.
- `src/lib/` — navigation, UI strings, URL helpers, icons, hast helpers.
- `src/plugins/` — `remarkCodeBlocks` renders each fenced block as a whole figure,
  Shiki included (`markdown.syntaxHighlight` is off for that reason);
  `rehypeProse` adds the inline-code class, heading anchors, scrollable tables
  and turns the home page's package table into an index.
- `src/styles/` — `base.css` (tokens, prose, code chrome, shared chrome) and
  `shell.css` (the frame: a hairline header over one centred island of
  navigation · column · contents).
- `src/scripts/site.ts` — theme, copy, package-manager tabs, contents scroll-spy,
  the drawer and the search dialog (Pagefind JS API).

## Code blocks

The Markdown stays plain — the chrome is derived at build time from the content's
own conventions, so the `.md` endpoints and `llms-full.txt` read as before:

- a first comment line naming a file (`// vite.config.ts`, optionally `— note`)
  becomes the block header and leaves the code;
- `npm …` followed by `# или: pnpm add / yarn add / bun add` (`# or: …` in English)
  becomes a package-manager tab group: the choice is remembered across pages and
  the copy button copies the active tab;
- anything else stays a plain block.

`public/og.png` is rendered from `scripts/og.html` with takumi-js. `pnpm og` rewrites it, and
`tests/og.test.ts` fails when the committed image is not what the template renders.
