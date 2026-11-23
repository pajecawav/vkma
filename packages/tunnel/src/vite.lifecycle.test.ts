import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeRecordFile } from "./core/identity.ts";
import { createTunnel } from "./core/tunnel.ts";
import type { TunnelHandle } from "./core/types.ts";
import { vkmaTunnel, type VkmaTunnelPluginOptions } from "./vite.ts";

/**
 * Plugin lifecycle: the tunnel factory is mocked so a test can deliver SDK
 * events at any moment relative to `createTunnel` resolving — the real SDK
 * reports `route-conflict` while it is still attaching, i.e. BEFORE the
 * handle exists.
 */

const dirs = vi.hoisted(() => ({ dataDir: "" }));

vi.mock("./core/tunnel.ts", () => ({ createTunnel: vi.fn() }));
// Never touch the real XDG store: the plugin resolves its data dir lazily.
vi.mock("./core/identity.ts", async importOriginal => {
	const actual = await importOriginal<typeof import("./core/identity.ts")>();
	return { ...actual, tunnelDataDir: () => dirs.dataDir };
});

const HOSTNAME = "4bznf5jcbkct.opentunnel.xyz";
const URL = `https://${HOSTNAME}`;

type FakeHttpServer = EventEmitter & {
	listening: boolean;
	address: () => { address: string; family: string; port: number };
};

const logs: string[] = [];
const output = (): string => logs.join("\n");
/** HTTP servers wired by a test; `afterEach` closes them like vite would. */
let httpServers: FakeHttpServer[] = [];

function fakeServer(): { httpServer: FakeHttpServer; config: Record<string, unknown> } {
	const httpServer = new EventEmitter() as FakeHttpServer;
	httpServer.listening = true;
	httpServer.address = () => ({ address: "127.0.0.1", family: "IPv4", port: 5173 });
	httpServers.push(httpServer);
	return {
		httpServer,
		config: { root: "/tmp/project", server: { port: 5173 }, preview: { port: 4173 } },
	};
}

/** A vite hook is either the function itself or `{ handler }` (vite's ObjectHook). */
type HookFn = (...args: never[]) => unknown;
const hookOf = (value: HookFn | { handler: HookFn } | undefined): HookFn | undefined =>
	typeof value === "function" ? value : value?.handler;

/** A pid no kernel hands out: far above every `pid_max` in practice. */
const DEAD_PID = 2147483647;

/** Wires one plugin instance to a fresh listening server. */
function boot(options: VkmaTunnelPluginOptions = {}): Plugin {
	const plugin = vkmaTunnel(options)[0] as Plugin;
	const server = fakeServer();
	hookOf(plugin.configureServer)?.(server as never);
	return plugin;
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

/** The real SDK's event order during a takeover, all BEFORE `connect` resolves. */
function emitTakeoverSequence(options: Parameters<typeof createTunnel>[0]): void {
	options.onEvent?.({ type: "connecting", attempt: 0 });
	options.onEvent?.({ type: "route-conflict", routes: ["@"] });
	options.onEvent?.({ type: "reconnecting", attempt: 1, delayMs: 177 });
	options.onEvent?.({ type: "connected", session: "s-1", routes: ["@"] });
}

beforeAll(async () => {
	dirs.dataDir = await fs.mkdtemp(path.join(import.meta.dirname, ".vite-test-data-"));
});

afterAll(async () => {
	await fs.rm(dirs.dataDir, { recursive: true, force: true });
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

		boot();

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

		boot({ profile: "app" });

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

		boot({ profile: "app" });

		await vi.waitFor(() => expect(output()).toContain(URL));
		expect(output()).not.toContain("tunnel: profile");
	});
});
