/**
 * The FAB: a shadow-DOM host button on the mini app page that toggles an
 * iframe overlay with the /__vkma panel. All styles live inside the shadow
 * root — nothing leaks into the host page and nothing of the host page
 * affects the panel chrome.
 */
import { CLIENT_PALETTE, clientColorIndex } from "../shared/colors.ts";

export interface FabOptions {
	base: string;
	/** Read live: the id can change when a duplicated tab yields its copied id. */
	getClientId: () => string;
}

// Outlined glyph, lucide-style: stroke rides on currentColor (the client
// color), integer 24-grid rendered at 24px so it stays crisp. The two
// stroke insets (x=3/14, w=7) keep a 2-unit gutter between the squares.
const GLYPH_LOGO = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>`;
const GLYPH_CLOSE = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const STYLES = `
:host {
  all: initial;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
* { box-sizing: border-box; }
.button {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483646;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 9999px;
  background: #ffffff;
  color: #171717;
  cursor: pointer;
  /* white on a page needs real separation: hairline edge + layered
   * ambient shadows, stronger than the usual quiet-button treatment */
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 0.05),
    0 2px 4px rgb(0 0 0 / 0.1),
    0 12px 32px rgb(0 0 0 / 0.22);
  transition: transform 120ms cubic-bezier(0.2, 0, 0, 1);
}
.button:hover { transform: translateY(-1px); }
.button:active { transform: translateY(0) scale(0.96); }
.button:focus-visible { outline: 2px solid #a3a3a3; outline-offset: 3px; }
.button svg { display: block; }
.panel {
  position: fixed;
  right: 16px;
  bottom: 68px;
  z-index: 2147483645;
  width: min(520px, calc(100vw - 32px));
  height: min(720px, calc(100vh - 100px));
  border: none;
  border-radius: 12px;
  overflow: hidden;
  background: #fafafa;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2), 0 24px 64px rgb(0 0 0 / 0.28);
  transform-origin: bottom right;
  transform: translateY(10px) scale(0.98);
  opacity: 0;
  pointer-events: none;
  transition: transform 160ms cubic-bezier(0.2, 0, 0, 1), opacity 120ms linear;
}
.panel[data-open="true"] {
  transform: none;
  opacity: 1;
  pointer-events: auto;
}
@media (max-width: 560px) {
  .panel {
    right: 12px;
    bottom: 64px;
    width: calc(100vw - 24px);
    height: calc(100vh - 84px);
  }
}
.panel iframe { width: 100%; height: 100%; border: none; display: block; }
`;

/** Returns a re-tint callback: the client id can change mid-session when a
 * duplicated tab yields its copied id. */
export function mountFab({ base, getClientId }: FabOptions): () => void {
	const host = document.createElement("div");
	host.dataset["vkmaFab"] = "";
	const root = host.attachShadow({ mode: "open" });

	root.innerHTML = `
		<style>${STYLES}</style>
		<button class="button" type="button" title="vkma devtools" aria-haspopup="dialog" aria-expanded="false">${GLYPH_LOGO}</button>
		<div class="panel" data-open="false" role="dialog" aria-label="vkma devtools">
			<iframe title="vkma devtools" tabindex="-1" allow="clipboard-write"></iframe>
		</div>
	`;

	const button = root.querySelector<HTMLButtonElement>(".button")!;
	const panel = root.querySelector<HTMLElement>(".panel")!;
	const iframe = root.querySelector<HTMLIFrameElement>("iframe")!;

	// The glyph is outlined and its stroke rides on currentColor — painting
	// the button paints the icon's stroke with this client's color, so tabs
	// are tellable apart without opening the panel.
	const applyColor = () => {
		button.style.color = CLIENT_PALETTE[clientColorIndex(getClientId())]!;
	};
	applyColor();

	let loaded = false;
	const setOpen = (open: boolean) => {
		if (open && !loaded) {
			// ?client= scopes the embedded panel to this page's collector.
			// Read at open time — the id can change if a duplicated tab
			// yields its copied id.
			iframe.src = `${base}?client=${encodeURIComponent(getClientId())}`;
			loaded = true;
		}
		panel.dataset["open"] = String(open);
		button.setAttribute("aria-expanded", String(open));
		button.innerHTML = open ? GLYPH_CLOSE : GLYPH_LOGO;
	};

	button.addEventListener("click", () => {
		setOpen(panel.dataset["open"] !== "true");
	});

	document.addEventListener("keydown", event => {
		if (event.key === "Escape" && panel.dataset["open"] === "true") {
			setOpen(false);
			button.focus();
		}
	});

	document.documentElement.append(host);
	return applyColor;
}
