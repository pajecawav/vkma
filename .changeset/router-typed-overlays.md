---
"@vkma.dev/router": minor
---

Typed overlays: modal/popout handles with phantom props, required params on links, and popout props delivery

- `showModal(handle, { params, props })`, `showGlobalModal(def, { props })`, `showPopout(def|handle, props)` and `useModalProps(handle)` type-check against declaration-carried phantoms; the loose string forms remain fallbacks. Panel definitions expose flattened handle maps (`panel.modals.share`, `panel.modals["owner.invite"]`, `panel.popouts.delete`); global overlays are declared via `defineGlobalModal` / `definePopout` next to their components.
- `createVkLink` targets with `$param` segments now REQUIRE `params` (a missing-params link compiled and broke at runtime before); param-less targets stay optional.
- FIX: the Popouts host silently dropped the props stashed by `showPopout(id, props)` — they are now delivered to the component (with `onClose` injected last).
- Documented decision: the builder-generated route tree is `AnyRoute` by construction, so raw TanStack `to`/`params`/`search` typing is inert in builder apps — the typed surface is the preset's handles (see DESIGN "Type safety"); the package is now part of the root `tsc -b` typecheck (a pre-existing `createElement` overload error in `link.tsx` was fixed with it).
