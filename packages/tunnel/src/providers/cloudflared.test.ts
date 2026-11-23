import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isTunnelError } from "../errors.ts";
import {
	CLOUDFLARED_SUPPORT_DAYS,
	readCloudflaredVersion,
	resolveCloudflaredBinary,
} from "./cloudflared-binary.ts";
import { cloudflaredProvider, cloudflaredTimings, parseCloudflaredLine } from "./cloudflared.ts";

/**
 * The real provider against a fake `cloudflared` (cloudflared.fake.mjs):
 * a script that prints the real log lines, records its argv, crashes on
 * request and can ignore SIGTERM. No network: `fetch` is stubbed.
 */

const FAKE_SOURCE = path.join(import.meta.dirname, "cloudflared.fake.mjs");
let binDir: string;
let stateDir: string;
let dataDir: string;
const ORIGINAL_TIMINGS = {
	...cloudflaredTimings,
	respawnDelaysMs: [...cloudflaredTimings.respawnDelaysMs],
};

beforeAll(async () => {
	const root = await fs.mkdtemp(path.join(import.meta.dirname, ".cloudflared-test-"));
	binDir = path.join(root, "bin");
	stateDir = path.join(root, "state");
	dataDir = path.join(root, "data");
	await fs.mkdir(binDir);
	await fs.mkdir(stateDir);
	await fs.mkdir(dataDir);
	await fs.copyFile(FAKE_SOURCE, path.join(binDir, "cloudflared"));
	await fs.chmod(path.join(binDir, "cloudflared"), 0o755);
});

afterAll(async () => {
	await fs.rm(path.dirname(binDir), { recursive: true, force: true });
});

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(null, { status: 200 })),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	Object.assign(cloudflaredTimings, ORIGINAL_TIMINGS, {
		respawnDelaysMs: [...ORIGINAL_TIMINGS.respawnDelaysMs],
	});
});

/** A fresh fake (launch counter reset) and the environment to hand to the provider. */
async function fake(env: Record<string, string> = {}): Promise<Record<string, string | undefined>> {
	await fs.rm(stateDir, { recursive: true, force: true });
	await fs.mkdir(stateDir);
	return {
		...process.env,
		PATH: `${binDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
		FAKE_CF_STATE: stateDir,
		...env,
	};
}

const launches = async (): Promise<number> =>
	Number(await fs.readFile(path.join(stateDir, "launches"), "utf8").catch(() => "0"));

const argvOf = async (launch: number): Promise<{ argv: string[]; hasToken: boolean }> =>
	JSON.parse(await fs.readFile(path.join(stateDir, `argv-${String(launch)}.json`), "utf8")) as {
		argv: string[];
		hasToken: boolean;
	};

interface Collected {
	events: string[];
	warnings: string[];
}

function collect(): Collected & {
	onEvent: Parameters<typeof cloudflaredProvider.connect>[0]["onEvent"];
	onWarning: NonNullable<Parameters<typeof cloudflaredProvider.connect>[0]["onWarning"]>;
} {
	const collected: Collected = { events: [], warnings: [] };
	return {
		...collected,
		onEvent: event => {
			collected.events.push(event.type);
		},
		onWarning: message => {
			collected.warnings.push(message);
		},
	};
}

type ConnectOptions = Parameters<typeof cloudflaredProvider.connect>[0];

function connect(
	options: Partial<ConnectOptions> = {},
): ReturnType<typeof cloudflaredProvider.connect> {
	return cloudflaredProvider.connect({
		profile: "cf",
		host: "localhost",
		port: 4173,
		dataDir,
		keepAlive: false,
		...options,
	});
}

/** Shrinks every wait so the tests run in milliseconds. */
function fast(): void {
	Object.assign(cloudflaredTimings, {
		warmupMinDelayMs: 20,
		warmupCapMs: 400,
		warmupStepMs: 10,
		termGraceMs: 150,
		killGraceMs: 2_000,
		respawnDelaysMs: [10, 10, 10, 10, 10],
		urlTimeoutMs: 2_000,
	});
}

describe("parseCloudflaredLine", () => {
	it("reads real cloudflared output", () => {
		const at = "2026-11-23T16:04:05Z ";
		expect(
			parseCloudflaredLine(
				`${at}INF |  https://civic-custom-allocated-pickup.trycloudflare.com   |`,
			),
		).toEqual({
			kind: "url",
			url: "https://civic-custom-allocated-pickup.trycloudflare.com",
		});
		expect(
			parseCloudflaredLine(
				`${at}INF Registered tunnel connection connIndex=0 connection=3407a768 event=0 ip=198.41.200.73 location=hel01 protocol=http2`,
			),
		).toEqual({ kind: "registered", location: "hel01", protocol: "http2" });
		expect(
			parseCloudflaredLine(
				`${at}ERR Serve tunnel error error="failed to accept QUIC stream: timeout: no recent network activity" connIndex=0 event=0`,
			),
		).toEqual({
			kind: "error",
			error: "failed to accept QUIC stream: timeout: no recent network activity",
		});
		expect(
			parseCloudflaredLine(`${at}INF Retrying connection in up to 2s connIndex=0 event=0`),
		).toEqual({
			kind: "retrying",
			retryInMs: 2_000,
		});
		expect(
			parseCloudflaredLine(`${at}INF Unregistered tunnel connection connIndex=0 event=0`)
				.kind,
		).toBe("unregistered");
		expect(parseCloudflaredLine(`${at}ERR Connection terminated connIndex=0`).kind).toBe(
			"terminated",
		);
		expect(
			parseCloudflaredLine(
				`${at}INF Initiating graceful shutdown due to signal terminated ...`,
			).kind,
		).toBe("shutdown");
		expect(parseCloudflaredLine(`${at}INF Tunnel server stopped`).kind).toBe("stopped");
		expect(parseCloudflaredLine(`${at}INF Thank you for trying Cloudflare Tunnel.`).kind).toBe(
			"other",
		);
	});

	it("does not mistake the apex for a Quick Tunnel URL", () => {
		expect(
			parseCloudflaredLine("INF Requesting new quick Tunnel on trycloudflare.com...").kind,
		).toBe("other");
	});
});

describe("cloudflared binary", () => {
	it("is looked up on PATH; a missing binary says how to install it", async () => {
		const env = await fake();
		expect(resolveCloudflaredBinary(undefined, env)).toBe(path.join(binDir, "cloudflared"));
		expect(resolveCloudflaredBinary("cloudflared", env)).toBe(path.join(binDir, "cloudflared"));

		let missing: unknown;
		try {
			resolveCloudflaredBinary(undefined, { PATH: "/nonexistent" });
		} catch (error) {
			missing = error;
		}
		expect(isTunnelError(missing)).toBe(true);
		expect((missing as { code?: string }).code).toBe("E_CLOUDFLARED_MISSING");
		expect((missing as Error).message).toContain("brew install cloudflared");
	});

	it("takes a path with a separator as given and refuses what is not executable", async () => {
		const absolute = path.join(binDir, "cloudflared");
		expect(resolveCloudflaredBinary(absolute, { PATH: "" })).toBe(absolute);
		let failure: unknown;
		try {
			resolveCloudflaredBinary(path.join(binDir, "missing"), {});
		} catch (error) {
			failure = error;
		}
		expect((failure as { code?: string }).code).toBe("E_CLOUDFLARED_MISSING");
	});

	it("reads the version and its age", async () => {
		const env = await fake();
		const current = readCloudflaredVersion(path.join(binDir, "cloudflared"), env);
		expect(current.version).toBe("2026.11.0");
		expect(current.built).toBe("20261113-20:44:36-UTC");
		expect(current.ageDays).toBeLessThanOrEqual(CLOUDFLARED_SUPPORT_DAYS);

		const old = readCloudflaredVersion(path.join(binDir, "cloudflared"), {
			...env,
			FAKE_CF_VERSION: "2020.1.1",
		});
		expect(old.ageDays).toBeGreaterThan(CLOUDFLARED_SUPPORT_DAYS);
	});

	it("fails on a binary whose --version does not parse", () => {
		let failure: unknown;
		try {
			readCloudflaredVersion(process.execPath, {});
		} catch (error) {
			failure = error;
		}
		expect((failure as { code?: string }).code).toBe("E_CLOUDFLARED_VERSION");
	});
});

describe("cloudflared provider — capabilities", () => {
	const base: ConnectOptions = {
		profile: "cf",
		host: "localhost",
		port: 4173,
		dataDir: "",
	};

	it("rewrites the Host header itself in quick mode and cannot in token mode", () => {
		const quick = {
			...base,
			cloudflared: {
				mode: "quick" as const,
				protocol: "http2" as const,
				binary: "cloudflared",
			},
		};
		const token = { ...base, cloudflared: { ...quick.cloudflared, mode: "token" as const } };
		// Quick rewrites the Host itself; token mode cannot be helped from here
		// (the dashboard decides where the traffic goes).
		expect(cloudflaredProvider.hostHeaderPolicy?.(quick)).toBe("provider");
		expect(cloudflaredProvider.hostHeaderPolicy?.(token)).toBe("unhandled");
		// No cloudflared section at all: the quick defaults.
		expect(cloudflaredProvider.hostHeaderPolicy?.(base)).toBe("provider");
		expect(cloudflaredProvider.persistentIdentity?.(quick)).toBe(false);
		expect(cloudflaredProvider.persistentIdentity?.(token)).toBe(true);
	});
});

describe("cloudflared provider — quick mode", () => {
	it("runs cloudflared with the documented arguments and announces a warm URL", async () => {
		fast();
		const env = await fake();
		const collected = collect();
		const fetchMock = vi.mocked(fetch);
		// Edge frontends answer 530 until they know the route.
		fetchMock.mockImplementationOnce(async () => new Response(null, { status: 530 }));

		const connection = await connect({
			env,
			onEvent: collected.onEvent,
			onWarning: collected.onWarning,
		});

		try {
			const { argv, hasToken } = await argvOf(1);
			expect(argv).toEqual([
				"tunnel",
				"--no-autoupdate",
				"--loglevel",
				"info",
				"--protocol",
				"http2",
				"--url",
				"http://localhost:4173",
				"--http-host-header",
				"localhost:4173",
			]);
			expect(hasToken).toBe(false);
			expect(connection.hostname).toBe("fake-tunnel-1.trycloudflare.com");
			expect(connection.urls).toEqual({ "@": "https://fake-tunnel-1.trycloudflare.com" });
			expect(connection.status().state).toBe("connected");
			// Waited for a non-edge answer: the first probe saw 530, the second 200.
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(fetchMock.mock.calls[0]?.[0]).toBe("https://fake-tunnel-1.trycloudflare.com");
			expect(collected.warnings).toEqual([]);
			expect(collected.events).toEqual(["connected"]);

			await connection.close();
			expect(collected.events).toEqual(["connected", "stopped"]);
			expect(connection.status().state).toBe("stopped");
		} finally {
			await connection.close();
		}
	});

	it("announces anyway, with a warning, when the URL never answers", async () => {
		fast();
		const env = await fake();
		const collected = collect();
		vi.mocked(fetch).mockImplementation(async () => new Response(null, { status: 530 }));

		const connection = await connect({
			env,
			onEvent: collected.onEvent,
			onWarning: collected.onWarning,
		});
		try {
			expect(collected.warnings[0]).toContain("does not answer yet");
			expect(connection.hostname).toBe("fake-tunnel-1.trycloudflare.com");
			// No probe before the minimum delay after the URL line: an early
			// lookup is cached as NXDOMAIN for a minute.
			expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(1);
		} finally {
			await connection.close();
		}
	});

	it("never probes a name that was not printed", async () => {
		fast();
		Object.assign(cloudflaredTimings, { urlTimeoutMs: 300 });
		const env = await fake({ FAKE_CF_NO_URL: "1" });

		await expect(connect({ env })).rejects.toMatchObject({ code: "E_CLOUDFLARED_URL" });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("fails the start when cloudflared dies before printing a URL", async () => {
		fast();
		const env = await fake({ FAKE_CF_CRASH_LAUNCHES: "1" });

		const failure = await connect({ env }).catch((error: unknown) => error);

		expect(isTunnelError(failure)).toBe(true);
		expect((failure as { code?: string }).code).toBe("E_CLOUDFLARED_EXITED");
		expect((failure as Error).message).toContain("failed to start (exit code 7)");
		expect(await launches()).toBe(1);
	});

	it("fails the start when cloudflared dies behind the warm-up gate", async () => {
		fast();
		// The URL never answers, so the gate is still open when launch 1 dies.
		const env = await fake({ FAKE_CF_EXIT_AFTER: "150", FAKE_CF_EXIT_AFTER_LAUNCH: "1" });
		vi.mocked(fetch).mockImplementation(async () => new Response(null, { status: 530 }));

		const failure = await connect({ env }).catch((error: unknown) => error);

		expect((failure as { code?: string }).code).toBe("E_CLOUDFLARED_EXITED");
		// The respawn the exit triggered must not outlive the failed start.
		expect(await launches()).toBe(1);
	});

	it("respects the protocol and binary options", async () => {
		fast();
		const env = await fake();
		const connection = await connect({
			env,
			cloudflared: {
				mode: "quick",
				protocol: "quic",
				binary: path.join(binDir, "cloudflared"),
			},
		});
		try {
			const { argv } = await argvOf(1);
			expect(argv.slice(0, 6)).toEqual([
				"tunnel",
				"--no-autoupdate",
				"--loglevel",
				"info",
				"--protocol",
				"quic",
			]);
		} finally {
			await connection.close();
		}
	});
});

describe("cloudflared provider — token mode", () => {
	const tokenOptions = {
		mode: "token" as const,
		hostname: "app.example.com",
		protocol: "http2" as const,
		binary: "cloudflared",
	};

	it("needs a token and a hostname", async () => {
		const env = await fake();
		await expect(connect({ env, cloudflared: tokenOptions })).rejects.toMatchObject({
			code: "E_CLOUDFLARED_TOKEN",
		});
		await expect(
			connect({
				env,
				cloudflared: { ...tokenOptions, hostname: undefined, token: "some-token" },
			}),
		).rejects.toMatchObject({ code: "E_CLOUDFLARED_HOSTNAME" });
		expect(await launches()).toBe(0);
	});

	it("passes the token through the environment only and skips the warm-up", async () => {
		fast();
		const env = await fake();
		const collected = collect();

		const connection = await connect({
			env,
			onEvent: collected.onEvent,
			cloudflared: { ...tokenOptions, token: "secret-token-123" },
		});
		try {
			const { argv, hasToken } = await argvOf(1);
			expect(argv).toEqual([
				"tunnel",
				"--no-autoupdate",
				"--loglevel",
				"info",
				"--protocol",
				"http2",
				"run",
			]);
			expect(hasToken).toBe(true);
			expect(argv.join(" ")).not.toContain("secret-token-123");
			expect(connection.urls).toEqual({ "@": "https://app.example.com" });
			expect(connection.hostname).toBe("app.example.com");
			// A named tunnel is provisioned already: nothing to wait for.
			expect(fetch).not.toHaveBeenCalled();
			expect(collected.events).toEqual(["connected"]);
		} finally {
			await connection.close();
		}
	});

	it("takes the token from TUNNEL_TOKEN when the config has none", async () => {
		fast();
		const env = await fake({ TUNNEL_TOKEN: "from-env" });
		const connection = await connect({ env, cloudflared: tokenOptions });
		try {
			expect((await argvOf(1)).hasToken).toBe(true);
		} finally {
			await connection.close();
		}
	});
});

describe("cloudflared provider — staying up and stopping", () => {
	it("a restarted Quick Tunnel has a NEW URL: url-changed", async () => {
		fast();
		const env = await fake({ FAKE_CF_EXIT_AFTER: "250", FAKE_CF_EXIT_AFTER_LAUNCH: "1" });
		const collected = collect();

		const connection = await connect({ env, onEvent: collected.onEvent });
		try {
			await vi.waitFor(() => expect(collected.events).toContain("url-changed"));
			expect(collected.events).toEqual([
				"connected",
				"reconnecting",
				"url-changed",
				"connected",
			]);
			expect(connection.hostname).toBe("fake-tunnel-2.trycloudflare.com");
			expect(connection.urls["@"]).toBe("https://fake-tunnel-2.trycloudflare.com");
		} finally {
			await connection.close();
		}
	});

	it("gives up after the respawn budget and rejects `closed`", async () => {
		fast();
		const env = await fake({
			FAKE_CF_EXIT_AFTER: "200",
			FAKE_CF_EXIT_AFTER_LAUNCH: "1",
			FAKE_CF_CRASH_FROM: "2",
		});

		const connection = await connect({ env });

		await expect(connection.closed).rejects.toMatchObject({ code: "E_CLOUDFLARED_EXITED" });
		expect(await launches()).toBe(1 + cloudflaredTimings.respawnDelaysMs.length);
		expect(connection.status().state).toBe("stopped");
		await connection.close();
	});

	it("warns about a cloudflared older than Cloudflare's one-year support", async () => {
		fast();
		const env = await fake({ FAKE_CF_VERSION: "2020.1.1" });
		const collected = collect();
		const connection = await connect({ env, onWarning: collected.onWarning });
		try {
			expect(collected.warnings.join("\n")).toContain("update it");
		} finally {
			await connection.close();
		}
	});

	it("kills a child that ignores SIGTERM within the cap", async () => {
		fast();
		Object.assign(cloudflaredTimings, { termGraceMs: 150, killGraceMs: 5_000 });
		const env = await fake({ FAKE_CF_HANG_TERM: "1" });
		const connection = await connect({ env });

		const startedAt = Date.now();
		await connection.close();

		expect(Date.now() - startedAt).toBeLessThan(3_000);
		expect(connection.status().state).toBe("stopped");
	});

	it("stops on an abort signal", async () => {
		fast();
		const env = await fake();
		const controller = new AbortController();
		const connection = await connect({ env, signal: controller.signal });

		controller.abort();

		await connection.closed;
		expect(connection.status().state).toBe("stopped");
	});

	it("restarts cloudflared when the tunnel stops serving (watchdog)", async () => {
		fast();
		Object.assign(cloudflaredTimings, { watchdogIntervalMs: 40, watchdogFailureLimit: 2 });
		const env = await fake();
		const collected = collect();
		// The target answers directly; the tunnel answers 200 for the warm-up.
		let tunnelStatus = 200;
		vi.mocked(fetch).mockImplementation(async input => {
			const url =
				typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(null, {
				status: url.includes("trycloudflare.com") ? tunnelStatus : 200,
			});
		});

		const connection = await connect({ env, onEvent: collected.onEvent, keepAlive: true });
		try {
			// Two failed probes → the watchdog restarts the process (new URL).
			tunnelStatus = 530;
			await vi.waitFor(() => expect(collected.events).toContain("url-changed"), {
				timeout: 5_000,
			});
			expect(collected.events.slice(0, 3)).toEqual([
				"connected",
				"disconnected",
				"reconnecting",
			]);
			expect(await launches()).toBe(2);
		} finally {
			await connection.close();
		}
	});
});
