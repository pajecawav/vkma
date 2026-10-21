/**
 * The FAB: a shadow-DOM host button on the mini app page that toggles an
 * iframe overlay with the /__vkma panel. All styles live inside the shadow
 * root — nothing leaks into the host page and nothing of the host page
 * affects the panel chrome.
 */

export interface FabOptions {
	base: string;
}

const GLYPH_DIAMOND = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/></svg>`;
const GLYPH_CLOSE = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

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
  background: #171717;
  color: #fafafa;
  cursor: pointer;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.24), 0 8px 24px rgb(0 0 0 / 0.18);
  transition: transform 120ms cubic-bezier(0.2, 0, 0, 1);
}
.button:hover { transform: translateY(-1px); }
.button:active { transform: translateY(0) scale(0.96); }
.button:focus-visible { outline: 2px solid #fafafa; outline-offset: 3px; }
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

export function mountFab({ base }: FabOptions): void {
	const host = document.createElement("div");
	host.dataset["vkmaFab"] = "";
	const root = host.attachShadow({ mode: "open" });

	root.innerHTML = `
		<style>${STYLES}</style>
		<button class="button" type="button" title="vkma devtools" aria-haspopup="dialog" aria-expanded="false">${GLYPH_DIAMOND}</button>
		<div class="panel" data-open="false" role="dialog" aria-label="vkma devtools">
			<iframe title="vkma devtools" tabindex="-1"></iframe>
		</div>
	`;

	const button = root.querySelector<HTMLButtonElement>(".button")!;
	const panel = root.querySelector<HTMLElement>(".panel")!;
	const iframe = root.querySelector<HTMLIFrameElement>("iframe")!;

	let loaded = false;
	const setOpen = (open: boolean) => {
		if (open && !loaded) {
			iframe.src = base;
			loaded = true;
		}
		panel.dataset["open"] = String(open);
		button.setAttribute("aria-expanded", String(open));
		button.innerHTML = open ? GLYPH_CLOSE : GLYPH_DIAMOND;
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
}
