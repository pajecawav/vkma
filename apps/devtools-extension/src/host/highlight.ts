import type { ClientStatus } from "@vkma.dev/protocol";
import { CLIENT_PALETTE, clientColorIndex } from "@vkma.dev/protocol";

/**
 * The frame highlighter — the "locate" affordance: draws colored overlays
 * over the iframe(s) of a client so the panel's client card maps to a
 * visible frame on the page (and back, via vkma.frameFocus → card flash).
 *
 * Cross-origin reality: the host script cannot reach INTO a mini app
 * frame, but it does not need to — the overlay lives in the parent
 * document, positioned over the iframe's rect (the DevTools inspect
 * trick). Frames are matched by URL: the collector reports
 * `window.location.href` in its hello, the parent enumerates its
 * iframes' `src` attributes. Exact href first, then origin+pathname
 * (history.pushState inside the frame leaves `src` behind), then origin
 * when it is unambiguous. Matching never reads frame content — only the
 * parent's own DOM.
 */

/** How long a locate flash stays on screen. */
const FLASH_MS = 2500;

/** How strongly an iframe's src matches a client's frame URL. */
const enum MatchScore {
	None = 0,
	/** Same origin (used only when nothing stronger matches). */
	Origin = 1,
	/** Same origin and pathname. */
	Path = 2,
	/** Full URL equality. */
	Exact = 3,
}

export function scoreMatch(frameUrl: string, clientUrl: string, baseHref: string): MatchScore {
	try {
		const frame = new URL(frameUrl, baseHref);
		const client = new URL(clientUrl);
		if (frame.origin !== client.origin || frame.origin === "null") {
			return MatchScore.None;
		}
		if (frame.href === client.href) {
			return MatchScore.Exact;
		}
		if (frame.pathname === client.pathname) {
			return MatchScore.Path;
		}
		return MatchScore.Origin;
	} catch {
		return MatchScore.None;
	}
}

/**
 * The iframes that belong to a client: all elements scoring the best
 * available match (several frames can embed the same app — highlight
 * every one and let the label's count tell them apart). Only top-level
 * iframes of the host document: mini apps sit directly in the host page;
 * matching inside shadow roots is a v2 concern.
 */
export function matchClientFrames(
	document: Document,
	client: Pick<ClientStatus, "url">,
): HTMLIFrameElement[] {
	let best = MatchScore.None;
	const scored: Array<{ frame: HTMLIFrameElement; score: MatchScore }> = [];
	for (const frame of document.querySelectorAll("iframe")) {
		const src = frame.getAttribute("src");
		if (src === null) {
			continue;
		}
		// Relative srcs resolve against the host page's own base — exactly
		// how the browser resolved them when the page wrote the attribute.
		const score = scoreMatch(src, client.url, document.baseURI);
		if (score > MatchScore.None) {
			scored.push({ frame, score });
			if (score > best) {
				best = score;
			}
		}
	}
	return scored.filter(({ score }) => score === best).map(({ frame }) => frame);
}

export interface FrameHighlighter {
	/** Flash the frames of these clients for FLASH_MS. */
	show(clients: Array<Pick<ClientStatus, "clientId" | "url" | "bridge">>): void;
	/** Remove every overlay immediately. */
	clear(): void;
}

interface Overlay {
	host: HTMLElement;
	pairs: Array<{ frame: HTMLIFrameElement; box: HTMLElement }>;
}

export function createFrameHighlighter(document: Document): FrameHighlighter {
	const overlays = new Map<string, Overlay>();
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let rafId = 0;

	const remove = (clientId: string) => {
		const overlay = overlays.get(clientId);
		if (overlay === undefined) {
			return;
		}
		overlays.delete(clientId);
		overlay.host.remove();
	};

	const reposition = () => {
		for (const overlay of overlays.values()) {
			for (const { frame, box } of overlay.pairs) {
				const rect = frame.getBoundingClientRect();
				// A frame removed mid-flash (SPA navigation) reports a zero
				// rect — park its box instead of a stray corner flash.
				if (rect.width === 0 || rect.height === 0) {
					box.style.display = "none";
					continue;
				}
				box.style.display = "";
				box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
				box.style.width = `${rect.width}px`;
				box.style.height = `${rect.height}px`;
			}
		}
		rafId = overlays.size > 0 ? requestAnimationFrame(reposition) : 0;
	};

	return {
		show(clients) {
			for (const client of clients) {
				const frames = matchClientFrames(document, client);
				// Nothing matched — the frame is nested deeper than the host
				// document sees (or the app re-navigated): silently no-op.
				if (frames.length === 0) {
					continue;
				}
				remove(client.clientId);

				const host = document.createElement("div");
				host.dataset["vkmaHighlight"] = client.clientId;
				const shadow = host.attachShadow({ mode: "open" });
				const color =
					CLIENT_PALETTE[clientColorIndex(client.clientId)] ?? CLIENT_PALETTE[0];
				const label =
					frames.length > 1
						? `${client.clientId.slice(0, 8)} ×${frames.length}`
						: client.clientId.slice(0, 8);

				// `all: initial` fences the page's inherited styles out of the
				// shadow (same pattern as the FAB); boxes are fixed-positioned
				// and translated onto their frame's rect by the rAF loop.
				shadow.innerHTML = `
					<style>
						:host {
							all: initial;
							position: fixed;
							inset: 0;
							pointer-events: none;
							z-index: 2147483647;
						}
						.box {
							position: fixed;
							top: 0;
							left: 0;
							border: 2px solid ${color};
							border-radius: 4px;
							box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25), 0 0 12px ${color};
						}
						.label {
							position: absolute;
							top: 0;
							left: 0;
							transform: translateY(-100%);
							display: inline-flex;
							align-items: center;
							gap: 4px;
							padding: 2px 6px;
							border-radius: 4px 4px 0 0;
							background: ${color};
							color: #fff;
							font: 500 11px/1.4 ui-sans-serif, system-ui, sans-serif;
							white-space: nowrap;
						}
						.label::before {
							content: "";
							width: 6px;
							height: 6px;
							border-radius: 2px;
							background: rgb(255 255 255 / 0.85);
						}
					</style>
				`;

				const pairs: Overlay["pairs"] = [];
				for (const frame of frames) {
					const box = document.createElement("div");
					box.className = "box";
					const chip = document.createElement("span");
					chip.className = "label";
					// Spy mode is the surprising capture — mark it; direct mode
					// needs no annotation (the TopBar chip's vocabulary).
					chip.textContent = `${label}${client.bridge ? "" : " · sniffer"}`;
					box.append(chip);
					shadow.append(box);
					pairs.push({ frame, box });
				}

				document.documentElement.append(host);
				overlays.set(client.clientId, { host, pairs });
			}

			if (overlays.size > 0) {
				if (rafId === 0) {
					rafId = requestAnimationFrame(reposition);
				}
				clearTimeout(hideTimer);
				hideTimer = setTimeout(() => this.clear(), FLASH_MS);
			}
		},

		clear() {
			clearTimeout(hideTimer);
			hideTimer = undefined;
			if (rafId !== 0) {
				cancelAnimationFrame(rafId);
				rafId = 0;
			}
			// Deleting the just-visited key keeps a Map iterator valid.
			for (const clientId of overlays.keys()) {
				remove(clientId);
			}
		},
	};
}
