import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mergeRecordFile } from "../core/identity.ts";
import type { TunnelHandle } from "../core/types.ts";
import { main } from "./main.ts";

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
		const result = await run(["--route", "BAD"]);
		expect(result.code).toBe(1);
		expect(result.err).toContain("route");
	});
});

describe("run shutdown resilience", () => {
	/** A tunnel that NEVER settles `closed` and hangs inside `close()`. */
	function wedgedTunnel(): TunnelHandle {
		const forever = new Promise<void>(() => undefined);
		return {
			provider: "fake",
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
});
