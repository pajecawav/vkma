import { describe, expect, it } from "vitest";
import { isTunnelError } from "../errors.ts";
import { createTunnel, getTunnelProvider, tunnelProviderIds } from "./tunnel.ts";

describe("getTunnelProvider", () => {
	it("knows opentunnel", () => {
		expect(getTunnelProvider("opentunnel").id).toBe("opentunnel");
	});

	it("rejects unknown providers with a config error", () => {
		try {
			getTunnelProvider("ngrok");
			expect.unreachable("expected a throw");
		} catch (error) {
			expect(isTunnelError(error)).toBe(true);
			expect((error as { kind: string }).kind).toBe("config");
			expect((error as { code?: string }).code).toBe("E_UNKNOWN_PROVIDER");
		}
	});

	it("ships exactly one provider in v0.1", () => {
		expect(tunnelProviderIds()).toEqual(["opentunnel"]);
	});
});

describe("createTunnel option validation", () => {
	it("rejects an invalid port before touching the network", async () => {
		await expect(createTunnel({ port: 0 })).rejects.toThrow(/port/i);
		await expect(createTunnel({ port: 70000 })).rejects.toThrow(/port/i);
	});

	it("rejects an invalid route before touching the network", async () => {
		await expect(createTunnel({ port: 5173, route: "Bad Route" })).rejects.toThrow(/route/i);
	});

	it("rejects an invalid profile", async () => {
		await expect(createTunnel({ port: 5173, profile: "../evil" })).rejects.toThrow(/profile/i);
	});

	it("rejects an unknown provider", async () => {
		await expect(createTunnel({ port: 5173, provider: "nope" })).rejects.toThrow(/provider/i);
	});
});
