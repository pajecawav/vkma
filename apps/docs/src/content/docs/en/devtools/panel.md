---
title: "The panel"
description: "The bridge timeline, clients and execute in /__vkma/."
sidebar:
    order: 3
---

The panel lives at `/__vkma/` on your dev server (the URL prints at startup) or opens from the FAB right on the app page. It is the same SPA: light and dark themes follow the system, with a toggle in the header. Three sections: Timeline, Execute, Clients.

## Timeline

A log of all bridge traffic, modeled as request / response / event:

- **Request** — a row with the send's name and a payload preview; nested inside the group is the **paired response** with the round-trip duration and an ok/error mark.
- **Event** — unsolicited VK events (e.g. `VKWebAppUpdateConfig`) stand as their own rows.

A row expands into a collapsible JSON tree with type highlighting, collapsed-node previews and copy. Internal transport chatter (`vk-connect`) never reaches the log.

Above the log sits the filter row:

- search by event name;
- an All / Requests / Events segmented control;
- a client switcher (appears once more than one client is connected);
- pause — the view freezes at the pause point while new events buffer, shown as a counter;
- clear — the log empties, new events keep arriving.

A separate mechanism is **ignored events**: platform noise stays out of the log by default (`VKWebAppScrollTop`, `VKWebAppResizeWindow`, `SetSupportedHandlers`, `VKWebAppUpdateInsets`, `VKWebAppUpdateConfig`, `VKWebAppUpdateInfo`). Every row has an "Ignore <name>" action. The event hides immediately and from now on (a request together with its paired response); the full list editor opens from the filter row: add names, re-enable defaults with the toggles, or switch the filter off entirely with the eye toggle.

History lives on the dev server: the last 500 events. Open the panel long after the app started and it replays the buffer. Reloading the app page starts a new session. That client's history is purged on every surface.

## Execute

Send any bridge event into the running app without leaving the panel:

1. Pick the target client (in the standalone panel; in the embedded one it is pinned).
2. Start typing the event name. Autocomplete offers the bridge catalogue plus names already seen in the session. Picking a catalogue event prefills a params stub.
3. Params are JSON with live validation; send stays disabled while the JSON is invalid.

The result lands right there: a Response (ok) or an Error response as a payload, Timeout if nothing answered within 60 seconds, No such client if the target disconnected. Result payloads expand through the same JSON tree.

## Clients

Every connected page script — a desktop tab, a phone on LAN, an iframe, a standalone run — gets a card:

- platform, a colored short id and the page URL (sensitive query params are masked);
- User-Agent and the connection time ("connected 5m ago");
- an online/offline status — an offline client is dimmed, and refocusing its tab brings it back online;
- launch params as a key-value grid; sensitive values (`sign`, `access_token`, `auth_key`, `sid`, `secret`) are blurred and hinted nowhere.

Offline clients are removable one by one or via the Remove offline button. The server never removes live ones; they re-register on their own.

## Embedded scope (FAB)

The panel opened from the FAB shows only its own page's traffic: a colored client badge in the header, the Clients tab hidden, execute pinned to that client. Other clients' traffic never reaches such a panel at all, and an execute aimed at a foreign client returns forbidden. The standalone `/__vkma/` tab sees everything and switches between clients with the filter.

The button's own placement changes right from the panel (the DevTools position control): the pick is stored on the dev server origin and survives restarts; the initial value comes from the plugin's `fabPosition` option.

## Next

- [Vite plugin](/en/devtools/vite/) and [Rsbuild adapter](/en/devtools/rsbuild/) — setup.
- [MCP](/en/devtools/mcp/) — the same data and execute for coding agents.
