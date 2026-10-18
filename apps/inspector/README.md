# @vkma.dev/inspector

Chrome/Firefox extension (MV3) for inspecting VK Mini Apps. rsbuild + Solid.

```sh
# dev: watch-build
pnpm --filter @vkma.dev/inspector dev

# run in chrome / firefox (needs a built dist/)
pnpm --filter @vkma.dev/inspector start
pnpm --filter @vkma.dev/inspector start:firefox

# pack zips for both browsers
pnpm --filter @vkma.dev/inspector build:chrome
pnpm --filter @vkma.dev/inspector build:firefox
```

Browser target is selected via `BROWSER=chrome|firefox` (default `chrome`): rsbuild copies the matching `src/manifest.<browser>.json` into `dist/manifest.json`.
