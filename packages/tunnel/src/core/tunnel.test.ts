import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isTunnelError } from "../errors.ts";
import { startForwardProxy } from "../proxy.ts";
import { fakeSdk } from "../test-utils.ts";
import { mergeRecordFile } from "./identity.ts";
import { createTunnel, getTunnelProvider, tunnelProviderIds } from "./tunnel.ts";
import type { TunnelEvent } from "./types.ts";

// The resource-ownership tests run the REAL core against a fake SDK.
vi.mock("@opentunnel/client", async () => await import("../test-utils.ts"));
// Spied, not replaced: one test makes the loopback proxy fail to start.
vi.mock("../proxy.ts", async importOriginal => {
	const actual = await importOriginal<typeof import("../proxy.ts")>();
	return { ...actual, startForwardProxy: vi.fn(actual.startForwardProxy) };
});

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

describe("createTunnel resource ownership", () => {
	let dataDir: string;

	beforeAll(async () => {
		dataDir = await fs.mkdtemp(path.join(import.meta.dirname, ".tunnel-test-data-"));
	});

	afterAll(async () => {
		await fs.rm(dataDir, { recursive: true, force: true });
	});

	beforeEach(() => {
		fakeSdk.reset();
		vi.mocked(startForwardProxy).mockClear();
	});

	/**
	 * Listening TCP servers in this worker (one test file per worker).
	 * `getActiveResourcesInfo()` reflects a closed handle one loop turn
	 * later, hence the settle.
	 */
	const listeners = async (): Promise<number> => {
		await new Promise(resolve => setTimeout(resolve, 20));
		return process.getActiveResourcesInfo().filter(name => name === "TCPServerWrap").length;
	};

	/** A complete stored identity — the path that starts the proxy BEFORE connecting. */
	async function storeIdentity(profile: string): Promise<void> {
		await mergeRecordFile(dataDir, profile, {
			id: "4bznf5jcbkct",
			hostname: fakeSdk.hostname,
			token: "token",
			privateKey: "key",
			certificate: "cert",
			chain: "chain",
			certificateExpiry: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
		});
	}

	it("closes the proxy it started when the provider fails to connect", async () => {
		await storeIdentity("leaky");
		fakeSdk.failConnect = true;
		const before = await listeners();

		await expect(
			createTunnel({ port: 5173, profile: "leaky", dataDir, env: {}, keepAlive: false }),
		).rejects.toMatchObject({ kind: "network", code: "bad_token" });

		// A listening server would keep the caller's process alive.
		expect(await listeners()).toBe(before);
	});

	it("closes the bridge when the first-run proxy cannot start", async () => {
		// No stored identity: the hostname shows up during connect and the
		// proxy starts right after the attach.
		vi.mocked(startForwardProxy).mockRejectedValueOnce(new Error("listen EACCES"));
		const events: TunnelEvent[] = [];

		await expect(
			createTunnel({
				port: 5173,
				profile: "fresh",
				dataDir,
				env: {},
				keepAlive: false,
				onEvent: event => {
					events.push(event);
				},
			}),
		).rejects.toThrow("listen EACCES");

		// The bridge HAD attached — and must not be left holding the route.
		expect(fakeSdk.stats.attaches).toBe(1);
		expect(fakeSdk.stats.closes).toBe(1);
		expect(events.map(event => event.type)).toContain("stopped");
	});

	it("closes proxy and bridge together through close()", async () => {
		await storeIdentity("tidy");
		const before = await listeners();

		const handle = await createTunnel({
			port: 5173,
			profile: "tidy",
			dataDir,
			env: {},
			keepAlive: false,
		});
		expect(await listeners()).toBe(before + 1);
		await handle.close();

		expect(await listeners()).toBe(before);
		expect(fakeSdk.stats.closes).toBe(1);
	});
});
