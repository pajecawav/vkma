---
"@vkma.dev/create-app": minor
---

Router template: typed overlay definitions and a route-modal showcase

- Global modals/popouts declared via `defineGlobalModal` / `definePopout` (the id is written once next to the component); tab links target the typed hub handles.
- New `post/$id` route modal (`share.ui`) demonstrating typed `showModal(postPanel.modals.share, { params, props })` and `useModalProps(postPanel.modals.share)`.
- Pins `@vkma.dev/router` `0.2.0` — publish the router before pushing, or the CI scaffold e2e installs a nonexistent version.
