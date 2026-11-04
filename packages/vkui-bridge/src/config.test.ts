import type { VKBridgeEvent } from "@vkma.dev/bridge";
import { describe, expect, it } from "vitest";
import { resolveAdaptivity, resolveAppearance, resolveInsets } from "./config.ts";

const event = (type: string, data: unknown): VKBridgeEvent =>
	({ detail: { type, data } }) as VKBridgeEvent;

describe("resolveAppearance", () => {
	it("prefers the modern appearance field", () => {
		expect(resolveAppearance({ appearance: "dark", scheme: "bright_light" })).toBe("dark");
		expect(resolveAppearance({ appearance: "light", scheme: "space_gray" })).toBe("light");
	});

	it("maps the legacy dark schemes", () => {
		expect(resolveAppearance({ scheme: "space_gray" })).toBe("dark");
		expect(resolveAppearance({ scheme: "vkcom_dark" })).toBe("dark");
	});

	it("lights everything else", () => {
		expect(resolveAppearance({ scheme: "bright_light" })).toBe("light");
		expect(resolveAppearance({})).toBe("light");
	});
});

describe("resolveAdaptivity", () => {
	it("keeps the accepted directives as-is", () => {
		expect(
			resolveAdaptivity({
				adaptivity: "adaptive",
				viewport_width: 1400,
				viewport_height: 820,
			}),
		).toEqual({
			type: "adaptive",
			viewportWidth: 1400,
			viewportHeight: 820,
		});
		expect(resolveAdaptivity({ adaptivity: "force_mobile_COMPACT" }).type).toBeNull();
		expect(resolveAdaptivity({ adaptivity: "force_mobile" }).type).toBe("force_mobile");
		expect(resolveAdaptivity({ adaptivity: "force_mobile_compact" }).type).toBe(
			"force_mobile_compact",
		);
	});

	it("falls back to null and zeroes", () => {
		expect(resolveAdaptivity({}).type).toBeNull();
		expect(resolveAdaptivity({ adaptivity: "adaptive", viewport_width: Number.NaN })).toEqual({
			type: "adaptive",
			viewportWidth: 0,
			viewportHeight: 0,
		});
	});
});

describe("resolveInsets", () => {
	it("reads insets from both event sources", () => {
		const insets = { top: 24, left: 0, right: 0, bottom: 8 };
		expect(resolveInsets(event("VKWebAppUpdateInsets", { insets }))).toEqual(insets);
		expect(
			resolveInsets(event("VKWebAppUpdateConfig", { scheme: "bright_light", insets })),
		).toEqual(insets);
	});

	it("ignores everything else", () => {
		expect(resolveInsets(event("VKWebAppUpdateConfig", {}))).toBeNull();
		expect(resolveInsets(event("VKWebAppLocationChanged", { location: "/" }))).toBeNull();
	});

	it("clamps the transient keyboard", () => {
		expect(
			resolveInsets(
				event("VKWebAppUpdateInsets", {
					insets: { top: 0, left: 0, right: 0, bottom: 200 },
				}),
			),
		).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
		expect(resolveInsets(event("VKWebAppUpdateInsets", { insets: { bottom: 150 } }))).toEqual({
			bottom: 150,
		});
	});
});
