/**
 * The collector bootstrap injected into the app page's HTML: a plain
 * (non-module) script that pins the panel base on a global and appends
 * the real module tag at runtime, after the app's own module scripts.
 *
 * It must survive being placed in `<head>` before `<body>` exists (the
 * rsbuild adapter's tag injection lands there) — hence the DOM wait.
 */
export function injectSnippet(base: string): string {
	return `globalThis.__VKMA_DEVTOOLS_BASE__=${JSON.stringify(base)};(function(){function m(){var s=document.createElement("script");s.type="module";s.src=${JSON.stringify(`${base}inject.js`)};document.body.appendChild(s);}if(document.body){m()}else{document.addEventListener("DOMContentLoaded",m);}})();`;
}
