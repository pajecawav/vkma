import { describe, expect, it } from "vitest";
import { addAllowedHost, vkmaTunnel } from "./vite.ts";

describe("vkmaTunnel plugin factory", () => {
	it("returns one plugin named vkma-tunnel", () => {
		const plugins = vkmaTunnel();
		expect(plugins).toHaveLength(1);
		expect(plugins[0]?.name).toBe("vkma-tunnel");
	});

	it("returns nothing when disabled", () => {
		expect(vkmaTunnel({ enabled: false })).toEqual([]);
	});

	it("wires both dev and preview hooks", () => {
		const plugin = vkmaTunnel()[0];
		expect(typeof plugin?.configureServer).toBe("function");
		expect(typeof plugin?.configurePreviewServer).toBe("function");
		expect(typeof plugin?.closeServer).toBe("function");
		// Preview closes through its own hook — `closeServer` never runs there.
		expect(typeof plugin?.closePreviewServer).toBe("function");
	});
});

describe("addAllowedHost", () => {
	it("creates the array when unset", () => {
		const target: { allowedHosts?: string[] | true } = {};
		addAllowedHost(target, "abc.opentunnel.xyz");
		expect(target.allowedHosts).toEqual(["abc.opentunnel.xyz"]);
	});

	it("appends without duplicates", () => {
		const target: { allowedHosts?: string[] | true } = { allowedHosts: ["x.dev"] };
		addAllowedHost(target, "abc.opentunnel.xyz");
		addAllowedHost(target, "abc.opentunnel.xyz");
		expect(target.allowedHosts).toEqual(["x.dev", "abc.opentunnel.xyz"]);
	});

	it("keeps an explicit allow-all untouched", () => {
		const target: { allowedHosts?: string[] | true } = { allowedHosts: true };
		addAllowedHost(target, "abc.opentunnel.xyz");
		expect(target.allowedHosts).toBe(true);
	});
});
