/**
 * Pre-paint theme boot — loaded as a BLOCKING external script from the
 * panel template's <head> (MV3 extension CSP forbids inline scripts).
 * Synchronous by design: it must run before the first paint to avoid a
 * light→dark flash. Reads the localStorage mirror the theme hook
 * refreshes on every apply; chrome.storage remains the source of truth
 * and corrects a stale mirror right after mount.
 */
try {
	const stored = localStorage.getItem("vkma:theme");
	const dark =
		stored === "dark" ||
		(stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
	if (dark) {
		document.documentElement.classList.add("dark");
	}
} catch {
	// storage denied — fall through with the user-agent default
}
