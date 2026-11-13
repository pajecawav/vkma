# @vkma.dev/create-app

## 0.2.0

### Minor Changes

- 3641112: Router template: typed overlay definitions and a route-modal showcase

    - Global modals/popouts declared via `defineGlobalModal` / `definePopout` (the id is written once next to the component); tab links target the typed hub handles.
    - New `post/$id` route modal (`share.ui`) demonstrating typed `showModal(postPanel.modals.share, { params, props })` and `useModalProps(postPanel.modals.share)`.
    - Pins `@vkma.dev/router` `0.2.0` — publish the router before pushing, or the CI scaffold e2e installs a nonexistent version.

## 0.1.2

### Patch Changes

- 6bc6bb2: Run the overlay removal list before copying overlay files, fixing an empty src/app.tsx on case-insensitive filesystems (macOS, Windows)
- e0acfc3: Drop maintainer-only comments from the router template (hash-mode history internals, pending-render caveat)

## 0.1.1

### Patch Changes

- 73513c0: Fix: generated apps ship their `.gitignore` again. npm pack omits `gitignore` files from tarballs, so the template stores it dotless and the CLI writes it as `.gitignore` at scaffold time.

## 0.1.0

### Minor Changes

- a59f87c: Scaffold VK Mini Apps from templates: base, VKUI and router presets on Vite with the @vkma.dev stack

### Patch Changes

- 9d5c589: New package `@vkma.dev/vkui-bridge`: bridge-driven appearance, insets, adaptivity and a preassembled `VKBridgeConfigProvider`; the vkui/router templates ship it wired in `main.tsx` (and the router template pins 0.1.4).
