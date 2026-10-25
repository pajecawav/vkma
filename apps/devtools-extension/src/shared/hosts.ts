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
	"*://*.dzen.ru/*",
	"*://*.ok.ru/*",
	"*://*.okcdn.ru/*",
	"*://*.gameroom.games.mail.ru/*",
	"*://vkvideo.ru/*",
	"*://*.vkvideo.ru/*",
	"*://max.ru/*",
];

/** Every http(s) page in every frame — the collector / relay surface. */
export const ALL_FRAMES_MATCHES: readonly string[] = ["http://*/*", "https://*/*"];

/** Raw one-shot message: open the side panel of the sender's tab.
 * Side-panel gestures do not survive werpc ports — only runtime one-shots. */
export const OPEN_SIDE_PANEL_MESSAGE = "vkma:open-side-panel";
