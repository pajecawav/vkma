# @vkma.dev/inspect

Remote inspector for VK Mini Apps — the vkma.dev devtools panel over WebRTC, for pages neither the dev-server plugin nor the extension can reach: a mini app in the **VK webview on a phone**, a production build, a third-party app.

Two artifacts, one deployment ( [`inspect.vkma.dev`](https://inspect.vkma.dev) once deployed):

- **`/`** — the panel (the same `@vkma.dev/ui` surface the extension renders). Hosts the `DevtoolsStore` and a PeerJS peer in-process; shows the connection snippet, approves incoming pages, streams the timeline, executes bridge calls.
- **`/inspector.js?id=<peer id>`** — a single-file classic script pasted into a mini app page. Dials the panel over a WebRTC DataChannel (PeerJS for signaling only), captures bridge traffic, reports launch params, serves executes.

## Connecting a page

1. Open the panel — the **Connect** button holds the snippet:
    ```html
    <script src="https://inspect.vkma.dev/inspector.js?id=<peer id>"></script>
    ```
2. Put the tag **first in `<head>`**, before the app bundle: vk-bridge freezes its transport references at import, and the inspector must wrap the native bridge first.
3. Load the mini app. The first connection of each page parks behind the approve gate (on by default) — Allow / Always allow / Deny in the panel.

A console variant works for a quick look (own pages — vk.com's CSP may block console imports):

```js
import("https://inspect.vkma.dev/inspector.js?id=<peer id>");
```

Loaded late it sees less: only bridge methods that already exist on the page.

## What gets captured

| Environment                    | Outgoing (app → host)                                     | Incoming (host → app) | Execute |
| ------------------------------ | --------------------------------------------------------- | --------------------- | ------- |
| Page runs `@vkma.dev/bridge`   | via the bridge's own tap (authoritative, replay-buffered) | ✓                     | ✓       |
| Android webview                | forward-then-tap wrap of `AndroidBridge`                  | ✓ (`VKWebAppEvent`)   | ✓       |
| iOS webview                    | forward-then-tap wrap of `webkit.messageHandlers`         | ✓                     | ✓       |
| Top-level page, web transport  | wrap of `window.postMessage`                              | ✓ (window `message`)  | ✓       |
| Cross-origin iframe on desktop | ✗ (invisible without the extension)                       | ✓                     | ✓       |

Requests pair with responses by the wire `request_id` (vk-bridge injects it before the transport fires). `VKWebAppSettings` is transport chatter and never appears in the timeline.

## Security posture

- **The peer id is the capability.** Anyone holding it can connect as an inspector and read traffic including launch params (`sign`, `access_token` are blurred in the UI but live on the wire). Never commit the snippet to a public repo — or hit **Rotate**.
- **The approve gate is on by default**: new pages park until allowed. "Always allow" remembers the page's client id (it survives reloads); turning the gate off lets everyone in immediately.
- **No TURN, ever.** The ICE config is STUN-only — relay servers are architecturally absent, a pair that cannot connect directly fails honestly. Same Wi-Fi always works; many LTE↔broadband pairs do; symmetric NAT does not.
- Signaling rides the public PeerJS cloud (`0.peerjs.com`) — it brokers offers and sees candidate IPs (metadata); the data itself is DTLS peer-to-peer. A self-hosted broker is a one-line switch in `src/shared/config.ts`.

## Commands

```sh
pnpm dev      # panel + inspector on one origin (localhost:3000)
pnpm build    # two passes: dist/index.html… then dist/inspector.js (single file)
pnpm test
pnpm deploy   # build + wrangler deploy (Cloudflare Workers static assets)
```

`dist/inspector.js` must stay **one self-contained file** free of ESM-only syntax — it runs as a plain classic `<script>` and as a console `import()` on foreign pages; `src/inspector/artifact.test.ts` guards that after a build.
