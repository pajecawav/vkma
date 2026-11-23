import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TUNNEL_PROVIDER_IDS, type TunnelProviderId } from "../constants.ts";
import { isTunnelError } from "../errors.ts";
import { cloudflaredProvider, cloudflaredTimings } from "../providers/cloudflared.ts";
import { startForwardProxy } from "../proxy.ts";
import { fakeCloudflaredLaunches, fakeSdk, installFakeCloudflared } from "../test-utils.ts";
import { mergeRecordFile, readProfileRecord } from "./identity.ts";
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

	it("ships the two providers, opentunnel first (the default)", () => {
		expect(tunnelProviderIds()).toEqual(["opentunnel", "cloudflared"]);
	});

	it("keeps the registry and the provider id list in lockstep, both ways", () => {
		// The list feeds the config enumeration and the public type; the
		// registry decides what runs. Neither may know an id the other lacks.
		const alphabetical = (left: string, right: string): number => left.localeCompare(right);
		expect([...tunnelProviderIds()].toSorted(alphabetical)).toEqual(
			[...TUNNEL_PROVIDER_IDS].toSorted(alphabetical),
		);
		expect(getTunnelProvider("cloudflared")).toBe(cloudflaredProvider);
	});
});

describe("createTunnel option validation", () => {
	it("rejects an invalid port before touching the network", async () => {
		await expect(createTunnel({ port: 0 })).rejects.toThrow(/port/i);
		await expect(createTunnel({ port: 70000 })).rejects.toThrow(/port/i);
	});

	it("rejects an invalid route before touching the network", async () => {
		await expect(
			createTunnel({ port: 5173, opentunnel: { route: "Bad Route" } }),
		).rejects.toThrow(/route/i);
	});

	it("rejects an invalid profile", async () => {
		await expect(createTunnel({ port: 5173, profile: "../evil" })).rejects.toThrow(/profile/i);
	});

	it("rejects an unknown provider", async () => {
		// The type rejects this at compile time; a JavaScript caller (or a
		// stale string) still gets the runtime guard.
		await expect(
			createTunnel({ port: 5173, provider: "nope" as TunnelProviderId }),
		).rejects.toThrow(/provider/i);
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

describe("the opentunnel section", () => {
	let sectionDir: string;
	/** Where a run WITHOUT an explicit `dataDir` would land: the sandbox, never the real store. */
	const sandboxEnv = { XDG_DATA_HOME: path.join(import.meta.dirname, ".tunnel-section-xdg") };

	beforeAll(async () => {
		sectionDir = await fs.mkdtemp(path.join(import.meta.dirname, ".tunnel-section-data-"));
		await fs.mkdir(sandboxEnv.XDG_DATA_HOME, { recursive: true });
	});

	afterAll(async () => {
		await fs.rm(sectionDir, { recursive: true, force: true });
		await fs.rm(sandboxEnv.XDG_DATA_HOME, { recursive: true, force: true });
	});

	beforeEach(() => {
		fakeSdk.reset();
	});

	it("carries route and api to the provider, the record and the handle", async () => {
		const handle = await createTunnel({
			port: 5173,
			profile: "routed",
			dataDir: sectionDir,
			env: sandboxEnv,
			keepAlive: false,
			opentunnel: { route: "mobile", api: "https://opentunnel.example" },
		});
		try {
			// The provider read its own section: the core passed it through.
			expect(fakeSdk.requests.api).toBe("https://opentunnel.example");
			expect(Object.keys(fakeSdk.requests.routes)).toEqual(["mobile"]);
			// …and named the route back for what the core owns.
			expect(handle.urls).toEqual({ mobile: `https://mobile.${fakeSdk.hostname}` });
			expect(handle.primaryUrl).toBe(`https://mobile.${fakeSdk.hostname}`);
			expect((await readProfileRecord(sectionDir, "routed"))?.lastRoute).toBe("mobile");
		} finally {
			await handle.close();
		}
	});

	it("serves the apex when no section is given", async () => {
		const handle = await createTunnel({
			port: 5173,
			profile: "apex",
			dataDir: sectionDir,
			env: sandboxEnv,
			keepAlive: false,
		});
		try {
			expect(fakeSdk.requests.api).toBeUndefined();
			expect(Object.keys(fakeSdk.requests.routes)).toEqual(["@"]);
			expect(handle.primaryUrl).toBe(`https://${fakeSdk.hostname}`);
		} finally {
			await handle.close();
		}
	});
});

describe("createTunnel with the cloudflared provider", () => {
	let cfDir: string;
	/** Where a run WITHOUT an explicit `dataDir` would land: the sandbox, never the real store. */
	const sandboxEnv = { XDG_DATA_HOME: path.join(import.meta.dirname, ".tunnel-cf-test-xdg") };

	beforeAll(async () => {
		cfDir = await fs.mkdtemp(path.join(import.meta.dirname, ".tunnel-cf-test-data-"));
		await fs.mkdir(sandboxEnv.XDG_DATA_HOME, { recursive: true });
	});

	afterAll(async () => {
		await fs.rm(cfDir, { recursive: true, force: true });
		await fs.rm(sandboxEnv.XDG_DATA_HOME, { recursive: true, force: true });
	});

	const ORIGINAL_TIMINGS = {
		...cloudflaredTimings,
		respawnDelaysMs: [...cloudflaredTimings.respawnDelaysMs],
	};

	beforeEach(() => {
		Object.assign(cloudflaredTimings, {
			warmupMinDelayMs: 20,
			warmupCapMs: 400,
			warmupStepMs: 10,
			termGraceMs: 150,
			respawnDelaysMs: [10, 10, 10, 10, 10],
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 200 })),
		);
		vi.mocked(startForwardProxy).mockClear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		Object.assign(cloudflaredTimings, ORIGINAL_TIMINGS, {
			respawnDelaysMs: [...ORIGINAL_TIMINGS.respawnDelaysMs],
		});
	});

	/** A complete opentunnel identity seeded under `profile`. */
	async function storeOpentunnelIdentity(profile: string): Promise<void> {
		await mergeRecordFile(cfDir, profile, {
			provider: "opentunnel",
			id: "4bznf5jcbkct",
			hostname: fakeSdk.hostname,
			token: "token",
			privateKey: "key",
			certificate: "cert",
			chain: "chain",
			certificateExpiry: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
		});
	}

	it("refuses to run another provider on a profile that belongs to opentunnel", async () => {
		await storeOpentunnelIdentity("owned");
		const { env } = await installFakeCloudflared(cfDir, sandboxEnv);

		const failure = await createTunnel({
			provider: "cloudflared",
			port: 5173,
			profile: "owned",
			dataDir: cfDir,
			env,
		}).catch((error: unknown) => error);

		expect(failure).toMatchObject({ code: "E_PROVIDER_MISMATCH", kind: "config" });
		expect((failure as Error).message).toContain('belongs to provider "opentunnel"');
		// Nothing was launched and the identity is intact.
		expect(await fakeCloudflaredLaunches(path.join(cfDir, "fake-state"))).toBe(0);
		expect((await readProfileRecord(cfDir, "owned"))?.hostname).toBe(fakeSdk.hostname);
	});

	it("refuses opentunnel on a profile that belongs to cloudflared", async () => {
		await mergeRecordFile(cfDir, "named", {
			provider: "cloudflared",
			hostname: "app.example.com",
		});

		await expect(
			createTunnel({ port: 5173, profile: "named", dataDir: cfDir, env: sandboxEnv }),
		).rejects.toMatchObject({
			code: "E_PROVIDER_MISMATCH",
		});
	});

	it("quick mode writes no profile record and starts no proxy", async () => {
		const { env } = await installFakeCloudflared(cfDir, sandboxEnv);
		const warnings: string[] = [];

		const handle = await createTunnel({
			provider: "cloudflared",
			port: 5173,
			profile: "one-time",
			dataDir: cfDir,
			env,
			keepAlive: false,
			onWarning: message => {
				warnings.push(message);
			},
		});
		try {
			expect(handle.hostname).toBe("fake-tunnel-1.trycloudflare.com");
			expect(handle.primaryUrl).toBe("https://fake-tunnel-1.trycloudflare.com");
			// No loopback proxy beside the child.
			expect(startForwardProxy).not.toHaveBeenCalled();
			expect(await readProfileRecord(cfDir, "one-time")).toBeUndefined();
			expect(warnings).toEqual([]);
		} finally {
			await handle.close();
		}
	});

	it("a respawned Quick Tunnel changes the URL under the same handle", async () => {
		const { env } = await installFakeCloudflared(cfDir, {
			...sandboxEnv,
			FAKE_CF_EXIT_AFTER: "250",
			FAKE_CF_EXIT_AFTER_LAUNCH: "1",
		});
		const events: string[] = [];
		const handle = await createTunnel({
			provider: "cloudflared",
			port: 5173,
			profile: "one-time",
			dataDir: cfDir,
			env,
			keepAlive: false,
			onEvent: event => {
				events.push(event.type);
			},
		});
		try {
			await vi.waitFor(() => expect(events).toContain("url-changed"));
			expect(handle.hostname).toBe("fake-tunnel-2.trycloudflare.com");
			expect(handle.primaryUrl).toBe("https://fake-tunnel-2.trycloudflare.com");
		} finally {
			await handle.close();
		}
	});

	it("token mode stores its record, starts no proxy and warns about the Host header", async () => {
		const { env } = await installFakeCloudflared(cfDir, {
			...sandboxEnv,
			TUNNEL_TOKEN: "from-env",
		});
		const warnings: string[] = [];

		const handle = await createTunnel({
			provider: "cloudflared",
			port: 5173,
			profile: "named-app",
			dataDir: cfDir,
			env,
			keepAlive: false,
			cloudflared: {
				mode: "token",
				hostname: "app.example.com",
				protocol: "http2",
				binary: "cloudflared",
			},
			onWarning: message => {
				warnings.push(message);
			},
		});
		try {
			expect(startForwardProxy).not.toHaveBeenCalled();
			expect(handle.primaryUrl).toBe("https://app.example.com");
			expect(warnings.join("\n")).toContain("HTTP Host header override");
			const record = await readProfileRecord(cfDir, "named-app");
			expect(record).toMatchObject({ provider: "cloudflared", hostname: "app.example.com" });
		} finally {
			await handle.close();
		}
	});
});
