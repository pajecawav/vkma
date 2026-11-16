import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTunnelError } from "../errors.ts";
import { findConfigFile, resolveTunnelConfig } from "./resolve.ts";

let dir: string;

beforeAll(async () => {
	dir = await fs.mkdtemp(path.join(import.meta.dirname, ".resolve-test-"));
});

afterAll(async () => {
	await fs.rm(dir, { recursive: true, force: true });
});

async function writeConfig(name: string, body: string): Promise<void> {
	await fs.writeFile(path.join(dir, name), body, "utf8");
}

describe("findConfigFile", () => {
	it("walks up until a config file is found", async () => {
		await writeConfig("vkma-tunnel.config.json", JSON.stringify({ port: 3000 }));
		const nested = path.join(dir, "a", "b");
		await fs.mkdir(nested, { recursive: true });
		expect(findConfigFile(nested)).toBe(path.join(dir, "vkma-tunnel.config.json"));
	});

	it("returns undefined without a config anywhere on the path", () => {
		expect(findConfigFile(dir)).toBe(path.join(dir, "vkma-tunnel.config.json"));
	});
});

describe("resolveTunnelConfig", () => {
	it("applies defaults when no config file exists", async () => {
		const isolated = await fs.mkdtemp(path.join(import.meta.dirname, ".resolve-empty-"));
		try {
			const { config, meta } = await resolveTunnelConfig({ cwd: isolated });
			expect(config).toEqual({
				provider: "opentunnel",
				port: 5173,
				host: "127.0.0.1",
				route: "@",
				profile: undefined,
				api: undefined,
			});
			expect(meta.configPath).toBeUndefined();
			expect(meta.sources).toEqual({});
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("resolves file values over defaults", async () => {
		const isolated = await fs.mkdtemp(path.join(import.meta.dirname, ".resolve-empty-"));
		try {
			await fs.writeFile(
				path.join(isolated, "vkma-tunnel.config.json"),
				JSON.stringify({ port: 3000, profile: "custom" }),
				"utf8",
			);
			const { config, meta } = await resolveTunnelConfig({ cwd: isolated });
			expect(config.port).toBe(3000);
			expect(config.profile).toBe("custom");
			expect(config.provider).toBe("opentunnel");
			expect(config.host).toBe("127.0.0.1");
			expect(config.route).toBe("@");
			expect(meta.configPath).toBe(path.join(isolated, "vkma-tunnel.config.json"));
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("overrides beat the config file", async () => {
		const isolated = await fs.mkdtemp(path.join(import.meta.dirname, ".resolve-ovr-"));
		try {
			await fs.writeFile(
				path.join(isolated, "vkma-tunnel.config.json"),
				JSON.stringify({ port: 3000, host: "localhost" }),
				"utf8",
			);
			const { config, meta } = await resolveTunnelConfig({
				cwd: isolated,
				overrides: { port: 8080 },
			});
			expect(config.port).toBe(8080);
			expect(config.host).toBe("localhost");
			expect(meta.sources["port"]).toBe("override");
			expect(meta.sources["host"]).toBe("config");
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("loads TypeScript configs through native type stripping", async () => {
		const isolated = await fs.mkdtemp(path.join(import.meta.dirname, ".resolve-ts-"));
		try {
			await fs.writeFile(
				path.join(isolated, "vkma-tunnel.config.ts"),
				"export default { port: 4173, route: 'mobile' } as const;\n",
				"utf8",
			);
			const { config } = await resolveTunnelConfig({ cwd: isolated });
			expect(config.port).toBe(4173);
			expect(config.route).toBe("mobile");
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("rejects unknown fields naming the key", async () => {
		const isolated = await fs.mkdtemp(path.join(import.meta.dirname, ".resolve-bad-"));
		try {
			await fs.writeFile(
				path.join(isolated, "vkma-tunnel.config.json"),
				JSON.stringify({ prt: 3000 }),
				"utf8",
			);
			const call = resolveTunnelConfig({ cwd: isolated });
			await expect(call).rejects.toThrow(/prt/);
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("rejects an invalid route", async () => {
		const call = resolveTunnelConfig({ overrides: { route: "Bad Route" } });
		await expect(call).rejects.toThrow();
		try {
			await call;
		} catch (error) {
			expect(isTunnelError(error)).toBe(true);
		}
	});

	it("rejects an invalid port", async () => {
		const call = resolveTunnelConfig({ overrides: { port: 70000 } });
		await expect(call).rejects.toThrow(/port/i);
	});

	it("throws a config error for an explicit missing --config path", async () => {
		const call = resolveTunnelConfig({
			cwd: dir,
			configPath: path.join(dir, "nope.json"),
		});
		await expect(call).rejects.toThrow(/not found/i);
	});
});
