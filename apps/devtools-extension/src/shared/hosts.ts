/**
 * Where VK hosts mini apps — the extension's top-frame surface list.
 * `*` scheme covers http/https; apex + wildcard both listed because
 * `*.vk.com` does not match `vk.com` itself. The wildcard also covers the
 * mobile (`m.`) and internal (`cs7777.*`, `tau.*`) subdomains.
 */
export const HOST_MATCHES: readonly string[] = [
	"*://vk.com/*",
	"*://vk.ru/*",
	"*://*.vk.com/*",
	"*://*.vk.ru/*",
	"*://web.vk.me/*",
	"*://dzen.ru/*",
	"*://*.dzen.ru/*",
	"*://ok.ru/*",
	"*://*.ok.ru/*",
	"*://*.okcdn.ru/*",
	"*://*.gameroom.games.mail.ru/*",
	"*://vkvideo.ru/*",
	"*://*.vkvideo.ru/*",
	"*://max.ru/*",
];

/** Every http(s) page in every frame — the collector / relay surface. */
export const ALL_FRAMES_MATCHES: readonly string[] = ["http://*/*", "https://*/*"];

/** Raw one-shot message: open the side panel of a tab. Side-panel
 * gestures do not survive werpc ports — only runtime one-shots — and
 * extension pages have no `sender.tab`, so the payload carries the tabId
 * explicitly (content-script senders may omit it: sender.tab is used). */
export const OPEN_SIDE_PANEL_MESSAGE = "vkma:open-side-panel";

export interface OpenSidePanelMessage {
	type: typeof OPEN_SIDE_PANEL_MESSAGE;
	tabId?: number;
}
