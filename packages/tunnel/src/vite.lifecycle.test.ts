import { EventEmitter } from "node:events";
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin, UserConfig } from "vite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeRecordFile } from "./core/identity.ts";
import { createTunnel } from "./core/tunnel.ts";
import type { TunnelHandle } from "./core/types.ts";
import { EXIT_CLOSE_CAP_MS, installExitGuard } from "./vite-exit.ts";
import { vkmaTunnel, type VkmaTunnelPluginOptions } from "./vite.ts";

/**
 * Plugin lifecycle. The tunnel factory is mocked so a test can deliver SDK
 * events at any moment relative to `createTunnel` resolving — the real SDK
 * reports `route-conflict` while it is still attaching, i.e. BEFORE the
 * handle exists.
 */

const dirs = vi.hoisted(() => ({ dataDir: "", root: "" }));

vi.mock("./core/tunnel.ts", () => ({ createTunnel: vi.fn() }));
// Never touch the real XDG store: the plugin resolves its data dir lazily.
vi.mock("./core/identity.ts", async importOriginal => {
	const actual = await importOriginal<typeof import("./core/identity.ts")>();
	return { ...actual, tunnelDataDir: () => dirs.dataDir };
});

const HOSTNAME = "4bznf5jcbkct.opentunnel.xyz";
const URL = `https://${HOSTNAME}`;

/** A pid no kernel hands out: far above every `pid_max` in practice. */
const DEAD_PID = 2147483647;

type FakeHttpServer = EventEmitter & {
	listening: boolean;
	address: () => { address: string; family: string; port: number };
};

const logs: string[] = [];
const output = (): string => logs.join("\n");
/** HTTP servers wired by a test; `afterEach` closes them like vite would. */
let httpServers: FakeHttpServer[] = [];

/** A vite hook is either the function itself or `{ handler }` (vite's ObjectHook). */
type HookFn = (...args: never[]) => unknown;
const hookOf = (value: HookFn | { handler: HookFn } | undefined): HookFn | undefined =>
	typeof value === "function" ? value : value?.handler;

function fakeServer(root: string): { httpServer: FakeHttpServer; config: Record<string, unknown> } {
	const httpServer = new EventEmitter() as FakeHttpServer;
	httpServer.listening = true;
	httpServer.address = () => ({ address: "127.0.0.1", family: "IPv4", port: 5173 });
	httpServers.push(httpServer);
	return {
		httpServer,
		// `server.config.root` is Vite's RESOLVED root (symlinks resolved).
		config: { root: realpathSync(root), server: { port: 5173 }, preview: { port: 4173 } },
	};
}

/**
 * Wires one plugin instance the way Vite does: the `config` hook first,
 * then a listening server. Returns the plugin and its (possibly mutated)
 * user config.
 */
async function boot(
	options: VkmaTunnelPluginOptions = {},
	userConfig: UserConfig = {},
	root: string = dirs.root,
): Promise<{ plugin: Plugin; userConfig: UserConfig }> {
	const plugin = vkmaTunnel(options)[0] as Plugin;
	await hookOf(plugin.config)?.(
		userConfig as never,
		{ command: "serve", mode: "development" } as never,
	);
	const server = fakeServer(root);
	hookOf(plugin.configureServer)?.(server as never);
	return { plugin, userConfig };
}

/** A handle that stays up until closed; `closed` settles through `close`. */
function fakeHandle(): TunnelHandle {
	let settle: () => void = () => undefined;
	const closed = new Promise<void>(resolve => {
		settle = resolve;
	});
	return {
		provider: "opentunnel",
		profile: "app",
		hostname: HOSTNAME,
		urls: { "@": URL },
		primaryUrl: URL,
		events: (async function* () {})(),
		status: () => ({ state: "connected", hostname: HOSTNAME, connections: 0 }),
		close: async () => {
			settle();
		},
		closed,
	};
}

/** The tunnel comes up normally. */
function tunnelComesUp(): void {
	vi.mocked(createTunnel).mockImplementation(async () => fakeHandle());
}

/** The real SDK's event order during a takeover, all BEFORE `connect` resolves. */
function emitTakeoverSequence(options: Parameters<typeof createTunnel>[0]): void {
	options.onEvent?.({ type: "connecting", attempt: 0 });
	options.onEvent?.({ type: "route-conflict", routes: ["@"] });
	options.onEvent?.({ type: "reconnecting", attempt: 1, delayMs: 177 });
	options.onEvent?.({ type: "connected", session: "s-1", routes: ["@"] });
}

beforeAll(async () => {
	dirs.dataDir = await fs.mkdtemp(path.join(import.meta.dirname, ".vite-test-data-"));
	dirs.root = await fs.mkdtemp(path.join(import.meta.dirname, ".vite-test-root-"));
});

afterAll(async () => {
	await fs.rm(dirs.dataDir, { recursive: true, force: true });
	await fs.rm(dirs.root, { recursive: true, force: true });
});

beforeEach(() => {
	logs.length = 0;
	httpServers = [];
	vi.mocked(createTunnel).mockReset();
	vi.spyOn(console, "log").mockImplementation((text?: unknown) => {
		logs.push(String(text));
	});
});

afterEach(() => {
	// The httpServer "close" event is vite's own shutdown path for the plugin.
	for (const httpServer of httpServers) {
		httpServer.emit("close");
	}
	vi.restoreAllMocks();
});

describe("vkmaTunnel lifecycle", () => {
	it("survives a route conflict delivered before createTunnel resolves", async () => {
		vi.mocked(createTunnel).mockImplementation(async options => {
			emitTakeoverSequence(options);
			return fakeHandle();
		});

		await boot({ profile: "app" });

		await vi.waitFor(() => expect(output()).toContain(URL));
		expect(output()).toContain("route held by another bridge (@), taking over");
		expect(output()).not.toContain("failed to start");
		expect(output()).not.toContain("Cannot read properties of undefined");
	});

	it("names the route holder from the profile record on a startup conflict", async () => {
		// A dead incumbent: the service has not reaped its route yet.
		await mergeRecordFile(dirs.dataDir, "app", { hostname: HOSTNAME, pid: DEAD_PID });
		vi.mocked(createTunnel).mockImplementation(async options => {
			emitTakeoverSequence(options);
			return fakeHandle();
		});

		await boot({ profile: "app" });

		await vi.waitFor(() =>
			expect(output()).toContain(`was last used by process ${String(DEAD_PID)}`),
		);
	});

	it("stays silent when the record names this very process", async () => {
		await mergeRecordFile(dirs.dataDir, "app", { hostname: HOSTNAME, pid: process.pid });
		vi.mocked(createTunnel).mockImplementation(async options => {
			emitTakeoverSequence(options);
			return fakeHandle();
		});

		await boot({ profile: "app" });

		await vi.waitFor(() => expect(output()).toContain(URL));
		expect(output()).not.toContain("tunnel: profile");
	});
});

describe("vkmaTunnel shutdown", () => {
	it("owns Vite's unhandled exit signals only while a tunnel is live", async () => {
		// Vite registers nothing; neither does this test worker.
		expect(process.listenerCount("SIGINT")).toBe(0);
		expect(process.listenerCount("SIGHUP")).toBe(0);
		tunnelComesUp();

		const { plugin } = await boot({ profile: "app" });

		// The guard is installed once the tunnel is up.
		await vi.waitFor(() => {
			expect(process.listenerCount("SIGINT")).toBe(1);
			expect(process.listenerCount("SIGHUP")).toBe(1);
		});
		await hookOf(plugin.closeServer)?.({} as never, { reason: "close" } as never);
		// No tunnel, no say in Ctrl+C.
		expect(process.listenerCount("SIGINT")).toBe(0);
		expect(process.listenerCount("SIGHUP")).toBe(0);
	});

	it("closeServer waits for the tunnel close — but never longer than the cap", async () => {
		// A wedged SDK teardown: `close()` never settles.
		let closeCalls = 0;
		vi.mocked(createTunnel).mockImplementation(async () => ({
			...fakeHandle(),
			close: () => {
				closeCalls += 1;
				return new Promise<void>(() => undefined);
			},
		}));
		const { plugin } = await boot({ profile: "app" });
		await vi.waitFor(() => expect(output()).toContain(URL));

		vi.useFakeTimers();
		try {
			let settled = false;
			const closing = Promise.resolve(
				hookOf(plugin.closeServer)?.({} as never, { reason: "close" } as never),
			).then(() => {
				settled = true;
			});
			await vi.advanceTimersByTimeAsync(EXIT_CLOSE_CAP_MS - 1);
			// One millisecond short of the cap: still waiting for the SDK.
			expect(settled).toBe(false);
			await vi.advanceTimersByTimeAsync(1);
			await closing;
			expect(closeCalls).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("a close hook waits for the close the httpServer 'close' event already started", async () => {
		// Vite closes its HTTP server BEFORE it awaits the plugin hooks.
		let settled = false;
		const slowHandle: TunnelHandle = {
			...fakeHandle(),
			close: () =>
				new Promise<void>(resolve => {
					setTimeout(() => {
						settled = true;
						resolve();
					}, 60);
				}),
		};
		vi.mocked(createTunnel).mockImplementation(async () => slowHandle);
		const { plugin } = await boot({ profile: "app" });
		await vi.waitFor(() => expect(output()).toContain(URL));

		httpServers[0]?.emit("close");
		expect(settled).toBe(false);

		await hookOf(plugin.closeServer)?.({} as never, { reason: "close" } as never);
		// Resolving here before the SDK finished would let Vite's
		// `process.exit()` cut the bridge close short.
		expect(settled).toBe(true);
	});

	it("closes the previous tunnel first when a new one goes live (Vite restart)", async () => {
		const first = fakeHandle();
		const firstClose = vi.spyOn(first, "close");
		vi.mocked(createTunnel)
			.mockImplementationOnce(async () => first)
			.mockImplementationOnce(async () => fakeHandle());
		const plugin = vkmaTunnel({ profile: "app" })[0] as Plugin;
		await hookOf(plugin.config)?.({ root: dirs.root } as never, {} as never);
		hookOf(plugin.configureServer)?.(fakeServer(dirs.root) as never);
		await vi.waitFor(() => expect(output()).toContain(URL));
		expect(firstClose).not.toHaveBeenCalled();

		// Vite restarts: the same plugin instance is wired to a new server.
		hookOf(plugin.configureServer)?.(fakeServer(dirs.root) as never);

		await vi.waitFor(() => expect(vi.mocked(createTunnel)).toHaveBeenCalledTimes(2));
		await vi.waitFor(() => expect(firstClose).toHaveBeenCalledTimes(1));
	});
});

describe("installExitGuard", () => {
	const lastHandler = (signal: NodeJS.Signals): (() => void) =>
		process.listeners(signal).at(-1) as () => void;

	it("closes the tunnel first, then leaves with 128 + signal", async () => {
		const exit = vi.fn();
		const order: string[] = [];
		const release = installExitGuard(
			async () => {
				order.push("closed");
			},
			{ exit, signals: ["SIGINT", "SIGHUP"] },
		);
		try {
			lastHandler("SIGINT")();
			// The close is asynchronous: nothing has exited yet.
			expect(exit).not.toHaveBeenCalled();
			await vi.waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
			expect(exit).toHaveBeenLastCalledWith(130);
			lastHandler("SIGHUP")();
			await vi.waitFor(() => expect(exit).toHaveBeenCalledTimes(2));
			expect(exit).toHaveBeenLastCalledWith(129);
			expect(order).toEqual(["closed", "closed"]);
		} finally {
			release();
		}
		expect(process.listenerCount("SIGINT")).toBe(0);
		expect(process.listenerCount("SIGHUP")).toBe(0);
	});

	it("still leaves when the close fails", async () => {
		const exit = vi.fn();
		const release = installExitGuard(
			async () => {
				throw new Error("wedged");
			},
			{ exit, signals: ["SIGINT"] },
		);
		try {
			lastHandler("SIGINT")();
			await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
		} finally {
			release();
		}
	});

	it("leaves a signal alone that somebody else already owns", () => {
		const exit = vi.fn();
		const owner = (): void => undefined;
		process.once("SIGINT", owner);
		try {
			const release = installExitGuard(async () => undefined, {
				exit,
				signals: ["SIGINT", "SIGHUP"],
			});
			try {
				expect(process.listeners("SIGINT")).toEqual([owner]);
				expect(process.listenerCount("SIGHUP")).toBe(1);
			} finally {
				release();
			}
			expect(exit).not.toHaveBeenCalled();
		} finally {
			process.off("SIGINT", owner);
		}
	});
});

describe("vkmaTunnel config hook (Vite snapshots allowedHosts at startup)", () => {
	it("allows the stored identity's hostname while the config is still mutable", async () => {
		await mergeRecordFile(dirs.dataDir, "app", { hostname: HOSTNAME });
		tunnelComesUp();

		const { userConfig } = await boot({ profile: "app" });

		expect(userConfig.server?.allowedHosts).toContain(HOSTNAME);
		// preview.allowedHosts inherits server.allowedHosts — no own list is created.
		expect(userConfig.preview).toBeUndefined();
		await vi.waitFor(() => expect(output()).toContain(URL));
	});

	it("extends an explicit preview list and never narrows an allow-all", async () => {
		await mergeRecordFile(dirs.dataDir, "app", { hostname: HOSTNAME });
		tunnelComesUp();

		const { userConfig } = await boot(
			{ profile: "app" },
			{ server: { allowedHosts: true }, preview: { allowedHosts: ["x.dev"] } },
		);

		expect(userConfig.server?.allowedHosts).toBe(true);
		expect(userConfig.preview?.allowedHosts).toEqual(["x.dev", HOSTNAME]);
	});

	it("adds nothing for a brand-new profile", async () => {
		tunnelComesUp();

		const { userConfig } = await boot({ profile: "fresh" });

		expect(userConfig.server).toBeUndefined();
		await vi.waitFor(() => expect(output()).toContain(URL));
	});

	it("warns when host rewriting is off and the hostname is new to this run", async () => {
		tunnelComesUp();

		await boot({ profile: "fresh", hostRewrite: false });

		await vi.waitFor(() => expect(output()).toContain("host rewriting is off"));
		expect(output()).toContain("403 until the next restart");
	});

	it("stays silent with host rewriting off once the hostname is registered", async () => {
		await mergeRecordFile(dirs.dataDir, "app", { hostname: HOSTNAME });
		tunnelComesUp();

		await boot({ profile: "app", hostRewrite: false });

		await vi.waitFor(() => expect(output()).toContain(URL));
		expect(output()).not.toContain("host rewriting is off");
	});

	it("never lets an invalid tunnel config break Vite's startup", async () => {
		const bad = path.join(dirs.dataDir, "vkma-tunnel.config.json");
		await fs.writeFile(bad, JSON.stringify({ port: "nope" }));
		try {
			await boot({ config: bad }); // the hook itself must resolve
			await vi.waitFor(() => expect(output()).toContain("tunnel: failed to start"));
			expect(output()).toContain("Invalid tunnel configuration");
			expect(createTunnel).not.toHaveBeenCalled();
		} finally {
			await fs.rm(bad, { force: true });
		}
	});

	it("treats the Vite root as the project for the default profile", async () => {
		// A root that is NOT process.cwd(): the default profile follows it.
		const root = await fs.mkdtemp(path.join(dirs.dataDir, "root-"));
		try {
			await mergeRecordFile(dirs.dataDir, path.basename(root), { hostname: HOSTNAME });
			tunnelComesUp();

			const { userConfig } = await boot({}, { root }, root);

			expect(userConfig.server?.allowedHosts).toContain(HOSTNAME);
			await vi.waitFor(() => expect(createTunnel).toHaveBeenCalled());
			const call = vi.mocked(createTunnel).mock.calls[0]?.[0];
			expect(call?.cwd).toBe(realpathSync(root));
			// No explicit profile: the core derives it from `cwd` (the root).
			expect(call?.profile).toBeUndefined();
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
