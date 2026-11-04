/**
 * The collector bootstrap injected into the app page's HTML: a plain
 * (non-module) script that pins the panel base on a global and appends
 * the real module tag at runtime, after the app's own module scripts.
 *
 * It must survive being placed in `<head>` before `<body>` exists (the
 * rsbuild adapter's tag injection lands there), hence the DOM wait.
 */
export interface InjectSnippetConfig {
	/** Initial FAB placement; a placement picked in the panel wins over it. */
	fabPosition?: string;
}

export function injectSnippet(base: string, config: InjectSnippetConfig = {}): string {
	// Config globals are emitted only when set, so the default install
	// keeps the historical single-global snippet.
	const globals = [`globalThis.__VKMA_DEVTOOLS_BASE__=${JSON.stringify(base)}`];
	const configured = Object.entries(config).filter(([, value]) => value !== undefined);
	if (configured.length > 0) {
		globals.push(
			`globalThis.__VKMA_DEVTOOLS_CONFIG__=${JSON.stringify(Object.fromEntries(configured))}`,
		);
	}
	return `${globals.join(";")};(function(){function m(){var s=document.createElement("script");s.type="module";s.src=${JSON.stringify(`${base}inject.js`)};document.body.appendChild(s);}if(document.body){m()}else{document.addEventListener("DOMContentLoaded",m);}})();`;
}
