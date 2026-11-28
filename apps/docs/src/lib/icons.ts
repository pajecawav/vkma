// Authored icon set: one stroke weight (1.75), round caps, 24-box drawn at 16px.
// The same discipline as the devtools panel's set — no unicode stand-ins.
import type { Element } from "hast";
import { h } from "./hast";

interface Icon {
	inner: string;
	fill?: boolean;
	viewBox?: string;
}

// The Diamond-V mark from public/favicon.svg (64-box).
const MARK =
	"M3.3 5.9 L11.1 21.1 L16.11 11.33 L12.55 9.5 L11.1 12.33 L7.8 5.9 Z M17.5 2.8 L21 6.3 L17.5 9.8 L14 6.3 Z";

export const icons = {
	search: { inner: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>' },
	sun: {
		inner: '<circle cx="12" cy="12" r="3.6"/><path d="M12 2.8v2.1M12 19.1v2.1M4.4 4.4l1.5 1.5M18.1 18.1l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.4 19.6l1.5-1.5M18.1 5.9l1.5-1.5"/>',
	},
	moon: { inner: '<path d="M20 14.5A8.25 8.25 0 0 1 9.5 4a8.25 8.25 0 1 0 10.5 10.5Z"/>' },
	chevron: { inner: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>' },
	copy: {
		inner: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
	},
	check: { inner: '<path d="m5 12.5 4.5 4.5L19 7.5"/>' },
	pencil: {
		inner: '<path d="M4.5 19.5h3.6L18.4 9.2a2.3 2.3 0 0 0-3.3-3.3L4.5 16.3v3.2Z"/><path d="m13.6 7.4 3 3"/>',
	},
	menu: { inner: '<path d="M4 7h16M4 12h16M4 17h16"/>' },
	close: { inner: '<path d="M6 6l12 12M18 6 6 18"/>' },
	arrowLeft: { inner: '<path d="M19 12H5"/><path d="m11.5 18.5-6.5-6.5 6.5-6.5"/>' },
	arrowRight: { inner: '<path d="M5 12h14"/><path d="m12.5 5.5 6.5 6.5-6.5 6.5"/>' },
	anchor: {
		inner: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
	},
	info: { inner: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>' },
	github: {
		fill: true,
		inner: '<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>',
	},
} satisfies Record<string, Icon>;

export type IconName = keyof typeof icons;

const open = (icon: Icon) =>
	`<svg class="i" viewBox="${icon.viewBox ?? "0 0 24 24"}" width="16" height="16" fill="${icon.fill ? "currentColor" : "none"}"${icon.fill ? "" : ' stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">`;

/** The icon as an HTML string (for `set:html` in Astro templates). */
export const icon = (name: IconName): string => `${open(icons[name])}${icons[name].inner}</svg>`;

const pair = (icon: Icon): Element => {
	const children = [...icon.inner.matchAll(/<([\w-]+)([^>]*?)\/>/g)].map(([, tag, attrs]) => {
		const properties: Record<string, string> = {};
		for (const [, key, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
			properties[key] = value;
		}
		return h(tag, properties);
	});
	return h(
		"svg",
		{
			class: "i",
			viewBox: icon.viewBox ?? "0 0 24 24",
			width: "16",
			height: "16",
			fill: icon.fill ? "currentColor" : "none",
			stroke: icon.fill ? undefined : "currentColor",
			strokeWidth: icon.fill ? undefined : "1.75",
			strokeLinecap: icon.fill ? undefined : "round",
			strokeLinejoin: icon.fill ? undefined : "round",
			ariaHidden: "true",
		},
		children,
	);
};

/** The icon as a hast element (for Markdown plugins). */
export const iconHast = (name: IconName): Element => pair(icons[name]);

/** The copy button: both states are rendered, CSS picks the visible one. */
export const copyButtonHast = (label: string): Element =>
	h(
		"button",
		{ type: "button", class: "copy", dataCopy: "", ariaLabel: label, dataPagefindIgnore: "" },
		[iconHast("copy"), iconHast("check")],
	);

/** The favicon as-is: dark #111 tile, white mark. */
export const glyphTile = `<svg class="glyph" viewBox="0 0 64 64" width="22" height="22" aria-hidden="true"><rect width="64" height="64" rx="12" fill="#111"/><path transform="translate(7.7 8.1) scale(2)" fill="#fff" d="${MARK}"/></svg>`;
