# @vkma.dev/create-app

## 0.1.1

### Patch Changes

- 73513c0: Fix: generated apps ship their `.gitignore` again. npm pack omits `gitignore` files from tarballs, so the template stores it dotless and the CLI writes it as `.gitignore` at scaffold time.

## 0.1.0

### Minor Changes

- a59f87c: Scaffold VK Mini Apps from templates: base, VKUI and router presets on Vite with the @vkma.dev stack

### Patch Changes

- 9d5c589: New package `@vkma.dev/vkui-bridge`: bridge-driven appearance, insets, adaptivity and a preassembled `VKBridgeConfigProvider`; the vkui/router templates ship it wired in `main.tsx` (and the router template pins 0.1.4).
