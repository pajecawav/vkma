import { describe, expect, it } from "vitest";
import { renderQr } from "./qr.ts";

describe("renderQr", () => {
	it("renders a scannable block-art QR ending with a newline", () => {
		const output = renderQr("https://abc.opentunnel.xyz");
		expect(output.length).toBeGreaterThan(50);
		expect(output.endsWith("\n")).toBe(true);
		// qrcode-terminal small mode draws with block characters.
		expect(output).toMatch(/[▀▄█ ]{2}/);
	});
});
