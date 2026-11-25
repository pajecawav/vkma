/**
 * How a panel iframe closes the FAB that hosts it (the header's × button,
 * Escape). On narrow viewports the sheet is full-bleed and covers its own
 * toggle, so the panel needs a way out that crosses the frame boundary.
 */

export const FAB_CLOSE_MESSAGE = "vkma:fab:close";

/** The panel's side: ask the hosting page to close this iframe. */
export function requestFabClose(): void {
	window.parent.postMessage(FAB_CLOSE_MESSAGE, "*");
}

/**
 * The FAB's side: true only for the close message sent by OUR iframe.
 * `event.source` is the one thing a page script cannot forge without
 * holding that frame's window, so a lookalike message from any other
 * frame — or from the page itself — is ignored.
 */
export function isFabClose(
	event: { data: unknown; source: unknown },
	frame: { contentWindow: unknown },
): boolean {
	return (
		event.data === FAB_CLOSE_MESSAGE &&
		frame.contentWindow !== null &&
		event.source === frame.contentWindow
	);
}
