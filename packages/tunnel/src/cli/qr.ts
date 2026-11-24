/**
 * QR rendering for the `--qr` flag: scan the tunnel URL with a phone and
 * the mini app opens without retyping anything.
 */

import qr from "qrcode-terminal";

/** Renders a small QR to any writable surface (testable, no console coupling). */
export function renderQr(url: string): string {
	let output = "";
	qr.generate(url, { small: true }, text => {
		output = text;
	});
	return `${output}\n`;
}
