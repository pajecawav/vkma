import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The SDK loads on the first connect of a tunnel, not when the package is
 * imported (AGENTS.md, invariant 14). The fake's factory is the tripwire:
 * vitest runs it the first time anything under test imports the module,
 * through a static import or through `import()`.
 */
const load = vi.hoisted(() => ({ sdkFactories: 0 }));

vi.mock("@opentunnel/client", async () => {
	load.sdkFactories += 1;
	return await import("./test-utils.ts");
});

describe("the opentunnel SDK", () => {
	let dataDir: string;

	beforeAll(async () => {
		dataDir = await fs.mkdtemp(path.join(import.meta.dirname, ".lazy-sdk-data-"));
	});

	afterAll(async () => {
		await fs.rm(dataDir, { recursive: true, force: true });
	});

	it("is not loaded by importing the package, and is loaded by the first connect", async () => {
		// Every entry a consumer can import: the Node API, the Vite plugin
		// and the CLI.
		await import("./index.ts");
		await import("./vite.ts");
		await import("./cli/main.ts");
		expect(load.sdkFactories).toBe(0);

		const { opentunnelProvider } = await import("./providers/opentunnel.ts");
		const handle = await opentunnelProvider.connect({
			profile: "lazy",
			host: "127.0.0.1",
			port: 5173,
			dataDir,
			keepAlive: false,
		});
		try {
			expect(load.sdkFactories).toBe(1);
			expect(handle.urls).toEqual({ "@": "https://4bznf5jcbkct.opentunnel.xyz" });
		} finally {
			await handle.close();
		}
	});
});
