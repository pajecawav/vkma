# @vkma.dev/docs

The [vkma.dev](https://vkma.dev) documentation site: Starlight on Astro, ru (root
locale) + en (`/en`), deployed to Cloudflare Workers static assets via Workers
Builds. `pnpm build` also runs `scripts/ai-endpoints.mjs`, which adds byte-exact
`.md` copies of every page plus `llms.txt` / `llms-full.txt` (see
`tests/ai-endpoints.test.ts`).

`public/og.png` is rendered from `scripts/og.html` with takumi-js. `pnpm og` rewrites it, and
`tests/og.test.ts` fails when the committed image is not what the template renders.
