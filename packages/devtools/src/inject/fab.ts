/**
 * The FAB: a shadow-DOM host button on the mini app page that toggles an
 * iframe overlay with the /__vkma panel. All styles live inside the shadow
 * root — nothing leaks into the host page and nothing of the host page
 * affects the panel chrome. The placement (bottom-right / bottom /
 * bottom-left) is a localStorage preference of the dev server origin —
 * see @vkma.dev/ui/fab-position.
 */
import { CLIENT_PALETTE, clientColorIndex } from "@vkma.dev/protocol";
import type { FabPosition } from "@vkma.dev/ui/fab-position";

export interface FabOptions {
	base: string;
	/** Read live: the id can change when a duplicated tab yields its copied id. */
	getClientId: () => string;
}

export interface FabHandle {
	/** Re-tint: the client id can change mid-session when a duplicated tab
	 * yields its copied id. */
	retint: () => void;
	/** Move the FAB between the three bottom placements. */
	setPosition: (position: FabPosition) => void;
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
  cursor: pointer;
  /* white on a page needs real separation: hairline edge + layered
   * ambient shadows, stronger than the usual quiet-button treatment */
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 0.05),
    0 2px 4px rgb(0 0 0 / 0.1),
    0 12px 32px rgb(0 0 0 / 0.22);
  transition:
    transform 120ms cubic-bezier(0.2, 0, 0, 1),
    translate 200ms cubic-bezier(0.2, 0, 0, 1);
}
.button:hover { transform: translateY(-1px); }
.button:active { transform: translateY(0) scale(0.96); }
.button:focus-visible { outline: 2px solid #a3a3a3; outline-offset: 3px; }
.button svg { display: block; }
/* center placement: translate keeps the hover lift from fighting the
 * centering transform (the last transform wins in the cascade, so the
 * lift variants below re-apply the full stack) */
:host(.vkma-pos-bottom) .button {
  left: 50%;
  right: auto;
  transform: translateX(-50%);
}
:host(.vkma-pos-bottom) .button:hover { transform: translateX(-50%) translateY(-1px); }
:host(.vkma-pos-bottom) .button:active { transform: translateX(-50%) translateY(0) scale(0.96); }
:host(.vkma-pos-bottom-left) .button { left: 16px; right: auto; }
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
  transition:
    transform 160ms cubic-bezier(0.2, 0, 0, 1),
    opacity 120ms linear,
    translate 200ms cubic-bezier(0.2, 0, 0, 1);
}
.panel[data-open="true"] {
  transform: none;
  opacity: 1;
  pointer-events: auto;
}
:host(.vkma-pos-bottom) .panel {
  left: 50%;
  right: auto;
  transform-origin: bottom center;
  transform: translateX(-50%) translateY(10px) scale(0.98);
}
:host(.vkma-pos-bottom) .panel[data-open="true"] { transform: translateX(-50%); }
:host(.vkma-pos-bottom-left) .panel {
  left: 16px;
  right: auto;
  transform-origin: bottom left;
}
@media (max-width: 560px) {
  .panel {
    right: 12px;
    bottom: 64px;
    width: calc(100vw - 24px);
    height: calc(100vh - 84px);
  }
  :host(.vkma-pos-bottom) .panel {
    left: 50%;
    right: auto;
    transform: translateX(-50%) translateY(10px) scale(0.98);
  }
  :host(.vkma-pos-bottom) .panel[data-open="true"] { transform: translateX(-50%); }
  :host(.vkma-pos-bottom-left) .panel { left: 12px; right: auto; }
}
/* The FLIP swap frame: anchors (left/right, transform-origin, the
 * per-variant transform) are not interpolable across positions, so they
 * must land instantly while the movement itself is played back on the
 * standalone translate property (px to px, single-type interpolation).
 * This class suppresses every transition for exactly one reflow. */
:host(.vkma-no-anim) .button,
:host(.vkma-no-anim) .panel {
  transition: none !important;
}
.panel iframe { width: 100%; height: 100%; border: none; display: block; }
`;

const POSITION_CLASSES: Record<FabPosition, string> = {
	"bottom-right": "vkma-pos-bottom-right",
	bottom: "vkma-pos-bottom",
	"bottom-left": "vkma-pos-bottom-left",
};

/** Returns a re-tint callback: the client id can change mid-session when a
 * duplicated tab yields its copied id. */
export function mountFab({ base, getClientId }: FabOptions): FabHandle {
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

	let currentPosition: FabPosition | undefined;

	return {
		retint: applyColor,
		setPosition: position => {
			if (position === currentPosition) {
				return;
			}
			currentPosition = position;

			// FLIP: First — where the movers sit now.
			const first = {
				button: button.getBoundingClientRect(),
				panel: panel.getBoundingClientRect(),
			};

			// Last — the new anchors land instantly (transitions off, so
			// the mismatched per-variant transforms cannot half-animate).
			host.classList.add("vkma-no-anim");
			for (const cls of Object.values(POSITION_CLASSES)) {
				host.classList.toggle(cls, cls === POSITION_CLASSES[position]);
			}

			// Invert — visually put each element back where it was, via
			// the standalone translate (composes in viewport space with
			// whatever per-variant transform now applies). One reflow
			// bakes anchor + inversion together before any paint.
			const invert = (el: HTMLElement, from: DOMRect) => {
				const to = el.getBoundingClientRect();
				el.style.translate = `${from.left - to.left}px ${from.top - to.top}px`;
			};
			invert(button, first.button);
			invert(panel, first.panel);
			void host.offsetWidth;

			// Play — restore transitions (computed styles unchanged so far,
			// nothing fires yet), then in the NEXT frame release the
			// inversion: translate glides each element to its new spot.
			host.classList.remove("vkma-no-anim");
			requestAnimationFrame(() => {
				button.style.translate = "";
				panel.style.translate = "";
			});
		},
	};
}
