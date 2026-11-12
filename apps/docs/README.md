# @vkma.dev/docs

The [vkma.dev](https://vkma.dev) documentation site: Starlight on Astro, ru (root
locale) + en (`/en`), deployed to Cloudflare Workers static assets via Workers
Builds. `pnpm build` also runs `scripts/ai-endpoints.mjs`, which adds byte-exact
`.md` copies of every page plus `llms.txt` / `llms-full.txt` (see
`tests/ai-endpoints.test.ts`).
