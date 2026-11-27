import { describe, expect, it } from "vitest";
import { EnvelopeAttributor } from "./attribute.ts";

const GAME = "https://game.example.com";
const APP = "https://app.example.com";

describe("EnvelopeAttributor", () => {
	it("an envelope belongs to the client that said hello from its origin", () => {
		const attribution = new EnvelopeAttributor();
		expect(attribution.attribute(undefined, GAME)).toBeUndefined();
		attribution.register("game", undefined, GAME);
		expect(attribution.attribute(undefined, GAME)).toBe("game");
	});

	it("the frame id the host assigned tells frames of one origin apart", () => {
		const attribution = new EnvelopeAttributor();
		attribution.register("a", "f-a", APP);
		attribution.register("b", "f-b", APP);
		expect(attribution.attribute("f-a", APP)).toBe("a");
		expect(attribution.attribute("f-b", APP)).toBe("b");
		// without an id the newest hello on that origin is the best guess
		expect(attribution.attribute(undefined, APP)).toBe("b");
		// an id nobody registered does not overrule the origin
		expect(attribution.attribute("f-x", APP)).toBe("b");
	});

	it("a sender no collector said hello from is nobody's, frame id or not: it is a relay", () => {
		// OK's adapter passes the game's envelopes on up to the top window.
		// The game's own parent already reported the original; the copy
		// arrives under the adapter's origin.
		const attribution = new EnvelopeAttributor();
		attribution.register("game", "adapter-frame-1", GAME);
		expect(attribution.attribute("adapter-frame-1", "https://ok.ru")).toBeUndefined();
		expect(attribution.attribute(undefined, "https://ok.ru")).toBeUndefined();
		expect(attribution.attribute("adapter-frame-1", "null")).toBeUndefined();
	});

	it("a later hello on an origin takes the origin over; ids stay with their owners", () => {
		const attribution = new EnvelopeAttributor();
		attribution.register("a", "f-a", APP);
		attribution.register("b", undefined, APP);
		expect(attribution.attribute(undefined, APP)).toBe("b");
		expect(attribution.attribute("f-a", APP)).toBe("a");
	});
});
