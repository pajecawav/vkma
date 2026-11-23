import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeRecordFile, readProfileRecord } from "../core/identity.ts";
import type { CreateTunnelOptions, TunnelHandle } from "../core/types.ts";
import { fakeSdk } from "../test-utils.ts";
import { main } from "./main.ts";

// Only the "real core" test reaches the SDK; every other run injects a
// tunnel fake.
vi.mock("@opentunnel/client", async () => await import("../test-utils.ts"));

let dataDir: string;
let cwd: string;
let out: string[];
let errOut: string[];
const stdout = {
	write: (text: string): void => {
		out.push(text);
	},
	isTTY: false,
};

beforeEach(() => {
	fakeSdk.reset();
});

beforeAll(async () => {
	dataDir = await fs.mkdtemp(path.join(import.meta.dirname, ".main-test-data-"));
	cwd = await fs.mkdtemp(path.join(import.meta.dirname, ".main-test-cwd-"));
});

afterAll(async () => {
	await fs.rm(dataDir, { recursive: true, force: true });
	await fs.rm(cwd, { recursive: true, force: true });
});

async function run(argv: readonly string[]): Promise<{ code: number; out: string; err: string }> {
	out = [];
	errOut = [];
	const code = await main(argv, {
		cwd,
		dataDir,
		env: { HOME: "/home/test" },
		stdout,
		stderr: { write: (text: string): void => void errOut.push(text) },
		openUrl: () => undefined,
	});
	return { code, out: out.join(""), err: errOut.join("") };
}

describe("help and version", () => {
	it("prints help and exits 0", async () => {
		const result = await run(["--help"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain("vkma-tunnel");
	});

	it("prints the version and exits 0", async () => {
		const result = await run(["--version"]);
		expect(result.code).toBe(0);
		expect(result.out).toMatch(/^\d+\.\d+\.\d+\n$/);
	});

	it("reports parse errors with exit 1", async () => {
		const result = await run(["--wat"]);
		expect(result.code).toBe(1);
		expect(result.err).toContain("Unknown flag");
	});
});

describe("list", () => {
	it("prints a hint when the store is empty", async () => {
		const result = await run(["list"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain("No stored tunnel identities");
	});

	it("lists records with URLs (--json)", async () => {
		await mergeRecordFile(dataDir, "demo", {
			hostname: "abc.opentunnel.xyz",
			lastTarget: "127.0.0.1:5173",
			lastRoute: "app",
		});
		const result = await run(["list", "--json"]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.out) as Array<{ profile: string; url: string }>;
		expect(parsed[0]?.profile).toBe("demo");
		expect(parsed[0]?.url).toBe("https://app.abc.opentunnel.xyz");
	});
});

describe("status", () => {
	it("fails with a hint for a profile without identity", async () => {
		const result = await run(["status", "unknown-profile"]);
		expect(result.code).toBe(1);
		expect(result.out).toContain("No stored tunnel");
	});

	it("probes the local target and the public URL", async () => {
		// A real local listener: the target probe must see it.
		const server = http.createServer((_req, res) => {
			res.end("ok");
		});
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		const port = typeof address === "object" && address !== null ? address.port : 0;
		try {
			await mergeRecordFile(dataDir, "live", {
				hostname: "def.opentunnel.xyz",
				lastTarget: `127.0.0.1:${String(port)}`,
			});
			const result = await run(["status", "live", "--json"]);
			expect(result.code).toBe(0);
			const parsed = JSON.parse(result.out) as {
				targetReachable: boolean;
				tunnelReachable: boolean;
				url: string;
			};
			expect(parsed.targetReachable).toBe(true);
			// https://def.opentunnel.xyz is not really serving: false is honest.
			expect(parsed.tunnelReachable).toBe(false);
			expect(parsed.url).toBe("https://def.opentunnel.xyz");
		} finally {
			await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});
});

describe("reset", () => {
	it("removes the resolved profile and reports it", async () => {
		await mergeRecordFile(dataDir, "demo", { hostname: "abc.opentunnel.xyz" });
		const result = await run(["reset", "--profile", "demo"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain('Removed identity for profile "demo"');
	});

	it("is honest when there is nothing to remove", async () => {
		const result = await run(["reset", "--profile", "demo"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain("No stored identity");
	});

	it("--all removes every profile", async () => {
		await mergeRecordFile(dataDir, "one", { hostname: "a.opentunnel.xyz" });
		await mergeRecordFile(dataDir, "two", { hostname: "b.opentunnel.xyz" });
		const result = await run(["reset", "--all"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain('"one"');
		expect(result.out).toContain('"two"');
		const empty = await run(["list"]);
		expect(empty.out).toContain("No stored tunnel identities");
	});
});

describe("config errors", () => {
	it("fails fast for an unknown provider (exit 1)", async () => {
		const result = await run(["--provider", "nope"]);
		expect(result.code).toBe(1);
		expect(result.err).toContain("provider");
	});

	it("fails fast for a bad route (exit 1)", async () => {
		const result = await run(["--opentunnel-route", "BAD"]);
		expect(result.code).toBe(1);
		expect(result.err).toContain("route");
	});

	it("refuses an opentunnel flag beside --provider cloudflared instead of ignoring it", async () => {
		const result = await run(["--provider", "cloudflared", "--opentunnel-route", "mobile"]);
		expect(result.code).toBe(1);
		expect(result.err).toContain('the opentunnel section needs "opentunnel" as provider');
	});

	it("hands the --opentunnel-* flags to createTunnel as the opentunnel section", async () => {
		out = [];
		errOut = [];
		let received: CreateTunnelOptions | undefined;
		const code = await main(
			["--opentunnel-route", "mobile", "--opentunnel-api=https://opentunnel.example"],
			{
				cwd,
				dataDir,
				env: { HOME: "/home/test" },
				stdout,
				stderr: { write: (text: string): void => void errOut.push(text) },
				createTunnel: async options => {
					received = options;
					return {
						...replaceableTunnel(),
						closed: new Promise<void>(resolve =>
							setTimeout(() => resolve(undefined), 20),
						),
						close: async () => undefined,
					};
				},
			},
		);
		expect(code).toBe(0);
		expect(received?.provider).toBe("opentunnel");
		expect(received?.opentunnel).toEqual({
			route: "mobile",
			api: "https://opentunnel.example",
		});
	});
});

describe("run shutdown resilience", () => {
	/** A pid no kernel hands out: far above every `pid_max` in practice. */
	const DEAD_PID = 2147483647;

	/** Runs `argv` against a tunnel fake that reports a route conflict, then stops. */
	async function conflictingRun(profile: string, argv: readonly string[]): Promise<void> {
		out = [];
		errOut = [];
		const code = await main(argv, {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			createTunnel: async options => ({
				...wedgedTunnel(),
				profile,
				primaryUrl: `https://${profile}.opentunnel.xyz`,
				urls: { "@": `https://${profile}.opentunnel.xyz` },
				closed: new Promise<void>(resolve => {
					setTimeout(() => {
						options.onEvent?.({ type: "route-conflict", routes: ["@"] });
						options.onEvent?.({ type: "stopped" });
						resolve(undefined);
					}, 20);
				}),
				close: async () => undefined,
			}),
		});
		expect(code).toBe(0);
		// The hint's record read is async — give it a tick to land.
		await new Promise(resolve => {
			setTimeout(resolve, 100);
		});
	}

	it("explains a dead route holder on a route conflict", async () => {
		await mergeRecordFile(dataDir, "hinted", {
			hostname: "hint.opentunnel.xyz",
			pid: DEAD_PID,
			startedAt: "2026-11-21T10:00:00.000Z",
		});
		await conflictingRun("hinted", ["--profile", "hinted"]);
		// The hint is a warn → stderr.
		expect(errOut.join("")).toContain(
			`profile "hinted" was last used by process ${String(DEAD_PID)} (started 2026-11-21T10:00:00.000Z), which is no longer running`,
		);
	});

	it("names a live rival on a route conflict", async () => {
		await mergeRecordFile(dataDir, "live-rival", {
			hostname: "live.opentunnel.xyz",
			pid: process.ppid,
		});
		await conflictingRun("live-rival", ["--profile", "live-rival"]);
		expect(errOut.join("")).toContain(`is also used by process ${String(process.ppid)}`);
	});

	it("does not self-hint when the record pid is our own", async () => {
		await mergeRecordFile(dataDir, "selfpid", {
			hostname: "self.opentunnel.xyz",
			pid: process.pid,
		});
		await conflictingRun("selfpid", []);
		expect(errOut.join("")).not.toContain("tunnel: profile");
	});

	it("finds the incumbent through the REAL core — pid is stamped only after our attach", async () => {
		// The incumbent attached first and left its pid in the record.
		await mergeRecordFile(dataDir, "rival", {
			hostname: fakeSdk.hostname,
			lastTarget: "localhost:5173",
			pid: DEAD_PID,
			startedAt: "2026-11-21T10:00:00.000Z",
		});
		fakeSdk.conflictOnAttach = true;
		const controller = new AbortController();
		out = [];
		errOut = [];
		const pending = main(["--profile", "rival"], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			signal: controller.signal,
		});
		await vi.waitFor(() => {
			expect(out.join("")).toContain(`https://${fakeSdk.hostname}`);
		});
		// The conflict hit while we were still attaching: the incumbent must be named.
		await vi.waitFor(() => {
			expect(errOut.join("")).toContain(`was last used by process ${String(DEAD_PID)}`);
		});
		// From now on the record names us — we hold the route.
		expect((await readProfileRecord(dataDir, "rival"))?.pid).toBe(process.pid);
		controller.abort();
		expect(await pending).toBe(130);
	}, 10_000);

	it("Ctrl+C exits as soon as the SDK has closed the bridge — not after the 3 s grace", async () => {
		fakeSdk.closeDelayMs = 20;
		const controller = new AbortController();
		out = [];
		errOut = [];
		const pending = main([], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			signal: controller.signal,
		});
		await vi.waitFor(() => {
			expect(out.join("")).toContain(`https://${fakeSdk.hostname}`);
		});

		const abortedAt = Date.now();
		controller.abort();
		expect(await pending).toBe(130);
		// The SDK's close is the whole story; the grace is an upper bound.
		expect(Date.now() - abortedAt).toBeLessThan(1000);
	}, 10_000);

	/** A tunnel that NEVER settles `closed` and hangs inside `close()`. */
	function wedgedTunnel(): TunnelHandle {
		const forever = new Promise<void>(() => undefined);
		return {
			provider: "opentunnel",
			profile: "wedged",
			hostname: "wedged.opentunnel.xyz",
			urls: { "@": "https://wedged.opentunnel.xyz" },
			primaryUrl: "https://wedged.opentunnel.xyz",
			events: (async function* () {})(),
			status: () => ({
				state: "connected",
				hostname: "wedged.opentunnel.xyz",
				connections: 0,
			}),
			close: () => forever,
			closed: forever,
		};
	}

	it("exits 130 after SIGINT even when the tunnel never settles", async () => {
		const controller = new AbortController();
		out = [];
		errOut = [];
		const pending = main([], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			signal: controller.signal,
			createTunnel: async () => {
				controller.abort();
				return wedgedTunnel();
			},
		});
		// The abort fires mid-run; the grace window (3s) must carry the
		// exit even though `closed`/`close()` hang forever.
		const code = await pending;
		expect(code).toBe(130);
		expect(out.join("")).toContain("https://wedged.opentunnel.xyz");
	}, 10_000);

	it("exits 0 when the tunnel stops cleanly on its own", async () => {
		out = [];
		errOut = [];
		const code = await main([], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			createTunnel: async () => ({
				...wedgedTunnel(),
				// The tunnel stops by itself (server-side drain, close()):
				// `closed` resolves, no signal involved.
				closed: new Promise<void>(resolve => {
					setTimeout(() => resolve(undefined), 20);
				}),
				close: async () => undefined,
			}),
		});
		expect(code).toBe(0);
	});

	it("suppresses pre-banner noise: no Ready stage, no first connecting/connected lines", async () => {
		out = [];
		errOut = [];
		const code = await main([], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			createTunnel: async options => {
				options.onProgress?.("creating-tunnel");
				options.onProgress?.("creating-tunnel"); // dedupe
				options.onProgress?.("ready");
				options.onEvent?.({ type: "connecting", attempt: 0 });
				options.onEvent?.({ type: "connected", session: "s", routes: ["@"] });
				return {
					...wedgedTunnel(),
					closed: new Promise<void>(resolve => {
						setTimeout(() => resolve(undefined), 20);
					}),
					close: async () => undefined,
				};
			},
		});
		expect(code).toBe(0);
		const text = out.join("");
		expect(text).toContain("Creating tunnel…");
		expect(text).toContain("https://wedged.opentunnel.xyz");
		expect(text).not.toContain("Ready");
		expect(text).not.toContain("Attaching bridge");
		expect(text).not.toContain("connecting (attempt 0)");
		expect(text).not.toContain("  tunnel: connected");
	});

	it("emits NDJSON lifecycle records in --json mode", async () => {
		out = [];
		errOut = [];
		const code = await main(["--json"], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			createTunnel: async options => ({
				...wedgedTunnel(),
				closed: new Promise<void>(resolve => {
					setTimeout(() => {
						options.onEvent?.({ type: "stopped" });
						resolve(undefined);
					}, 20);
				}),
				close: async () => undefined,
			}),
		});
		expect(code).toBe(0);
		const text = out.join("");
		const records = text
			.split("\n")
			.filter(line => line !== "")
			.map(line => JSON.parse(line) as Record<string, unknown>);
		const events = records.map(record => record["event"]);
		expect(events).toContain("starting");
		expect(events).toContain("url");
		expect(events).toContain("stopped");
		const urlRecord = records.find(record => record["event"] === "url");
		expect(urlRecord?.["message"]).toBe("https://wedged.opentunnel.xyz");
	});
});

/** A handle whose URL the test can replace, like a respawned Quick Tunnel. */
function replaceableTunnel(): TunnelHandle & { replace: (url: string) => void } {
	let current = "https://first-tunnel.trycloudflare.com";
	let settle: () => void = () => undefined;
	return {
		provider: "cloudflared",
		profile: "quick-app",
		get hostname() {
			return new URL(current).hostname;
		},
		get urls() {
			return { "@": current };
		},
		get primaryUrl() {
			return current;
		},
		events: (async function* () {})(),
		status: () => ({
			state: "connected" as const,
			hostname: new URL(current).hostname,
			connections: 0,
		}),
		close: async () => {
			settle();
		},
		closed: new Promise<void>(resolve => {
			settle = resolve;
		}),
		replace: url => {
			current = url;
		},
	};
}

describe("run with the cloudflared provider", () => {
	/** A tunnel that stops by itself shortly after the banner. */
	function shortLivedTunnel(): TunnelHandle {
		return {
			...replaceableTunnel(),
			closed: new Promise<void>(resolve => setTimeout(() => resolve(undefined), 20)),
			close: async () => undefined,
		};
	}

	it("passes the flags to the config section, defaults applied", async () => {
		out = [];
		errOut = [];
		let received: CreateTunnelOptions | undefined;
		const code = await main(["--provider", "cloudflared", "--cloudflared-mode", "quick"], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			createTunnel: async options => {
				received = options;
				return {
					...shortLivedTunnel(),
				};
			},
		});
		expect(code).toBe(0);
		expect(received?.provider).toBe("cloudflared");
		expect(received?.cloudflared).toEqual({
			mode: "quick",
			hostname: undefined,
			token: undefined,
			protocol: "http2",
			binary: "cloudflared",
		});
	});

	it("fails with exit 1 when token mode has no hostname", async () => {
		const result = await run(["--provider", "cloudflared", "--cloudflared-mode", "token"]);
		expect(result.code).toBe(1);
		expect(result.err).toContain("cloudflared.hostname");
	});

	it("says that a Quick Tunnel URL is one-time", async () => {
		out = [];
		errOut = [];
		const handle = replaceableTunnel();
		const controller = new AbortController();
		const code = await main(["--provider", "cloudflared"], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			signal: controller.signal,
			createTunnel: async () => {
				// Like the real provider: the abort closes the tunnel.
				controller.signal.addEventListener("abort", () => void handle.close(), {
					once: true,
				});
				setTimeout(() => controller.abort(), 40);
				return handle;
			},
		});
		expect(code).toBe(130);
		expect(out.join("")).toContain("https://first-tunnel.trycloudflare.com");
		expect(errOut.join("")).toContain("Quick Tunnel — this URL is one-time");
	});

	it("prints a new banner when the URL is replaced under the same handle", async () => {
		out = [];
		errOut = [];
		const controller = new AbortController();
		const pending = main(["--provider", "cloudflared"], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			signal: controller.signal,
			createTunnel: async options => {
				setTimeout(
					() =>
						options.onEvent?.({
							type: "url-changed",
							url: "https://second-tunnel.trycloudflare.com",
						}),
					20,
				);
				setTimeout(() => controller.abort(), 60);
				return handleOf();
			},
		});
		function handleOf(): TunnelHandle {
			const handle = replaceableTunnel();
			handle.replace("https://second-tunnel.trycloudflare.com");
			return handle;
		}
		const code = await pending;
		expect(code).toBe(130);
		const text = out.join("");
		expect(text.match(/tunnel  →/g)).toHaveLength(2);
		expect(text).toContain("https://second-tunnel.trycloudflare.com");
		expect(text).toContain("the URL was replaced");
	});

	it("surfaces provider warnings in yellow on stderr", async () => {
		out = [];
		errOut = [];
		const code = await main(["--provider", "cloudflared"], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			createTunnel: async options => {
				options.onWarning?.("cloudflared 2020.1.1 is about 84 months old");
				return {
					...shortLivedTunnel(),
				};
			},
		});
		expect(code).toBe(0);
		expect(errOut.join("")).toContain("tunnel: cloudflared 2020.1.1 is about 84 months old");
	});

	it("emits a second url record with replaced: true in --json mode", async () => {
		out = [];
		errOut = [];
		const controller = new AbortController();
		const pending = main(["--provider", "cloudflared", "--json"], {
			cwd,
			dataDir,
			env: { HOME: "/home/test" },
			stdout,
			stderr: { write: (text: string): void => void errOut.push(text) },
			signal: controller.signal,
			createTunnel: async options => {
				const handle = replaceableTunnel();
				setTimeout(() => {
					handle.replace("https://second-tunnel.trycloudflare.com");
					options.onEvent?.({
						type: "url-changed",
						url: "https://second-tunnel.trycloudflare.com",
					});
				}, 20);
				setTimeout(() => controller.abort(), 60);
				return handle;
			},
		});
		await pending;
		const records = out
			.join("")
			.split("\n")
			.filter(line => line !== "")
			.map(line => JSON.parse(line) as { event: string; data?: { replaced?: boolean } });
		const urls = records.filter(record => record.event === "url");
		expect(urls.map(record => record.data?.replaced)).toEqual([false, true]);
	});
});

describe("list with a second provider", () => {
	it("shows the provider column only when a profile is not opentunnel's", async () => {
		await mergeRecordFile(dataDir, "plain-ot", { hostname: "ot.opentunnel.xyz" });
		let result = await run(["list"]);
		expect(result.out).not.toContain("provider");

		await mergeRecordFile(dataDir, "named-cf", {
			provider: "cloudflared",
			hostname: "app.example.com",
		});
		result = await run(["list"]);
		expect(result.out).toContain("provider");
		expect(result.out).toMatch(/named-cf\s+https:\/\/app\.example\.com.*cloudflared/);
		expect(result.out).toMatch(/plain-ot.*opentunnel/);
	});
});
