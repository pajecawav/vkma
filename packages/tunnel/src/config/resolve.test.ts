import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigValidationError, isTunnelError } from "../errors.ts";
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
				host: "localhost",
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
			expect(config.host).toBe("localhost");
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

describe("cloudflared config", () => {
	/** A directory with no config file anywhere above it (besides the user's). */
	async function isolatedDir(): Promise<string> {
		return fs.mkdtemp(path.join(import.meta.dirname, ".resolve-cf-"));
	}

	/** Runs the resolver and returns its issues as `path: message`; fails if it resolved. */
	async function issuesOf(run: () => Promise<unknown>): Promise<string[]> {
		try {
			await run();
		} catch (error) {
			if (error instanceof ConfigValidationError) {
				return error.issues.map(issue => `${issue.path}: ${issue.message}`);
			}
			throw error;
		}
		throw new Error("expected a ConfigValidationError");
	}

	it("is absent unless the file or an override sets it", async () => {
		const isolated = await isolatedDir();
		try {
			const { config } = await resolveTunnelConfig({ cwd: isolated });
			expect(config.cloudflared).toBeUndefined();
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("applies the section's defaults", async () => {
		const isolated = await isolatedDir();
		try {
			const { config } = await resolveTunnelConfig({
				cwd: isolated,
				overrides: { provider: "cloudflared", cloudflared: {} },
			});
			expect(config.provider).toBe("cloudflared");
			expect(config.cloudflared).toEqual({
				mode: "quick",
				hostname: undefined,
				token: undefined,
				protocol: "http2",
				binary: "cloudflared",
			});
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("merges a section override key by key instead of replacing the file's section", async () => {
		const isolated = await isolatedDir();
		try {
			await fs.writeFile(
				path.join(isolated, "vkma-tunnel.config.json"),
				JSON.stringify({
					provider: "cloudflared",
					cloudflared: { mode: "token", hostname: "app.example.com", protocol: "quic" },
				}),
				"utf8",
			);
			// `--cloudflared-protocol http2` alone must not drop the hostname.
			const { config } = await resolveTunnelConfig({
				cwd: isolated,
				overrides: { cloudflared: { protocol: "http2" } },
			});
			expect(config.cloudflared).toEqual({
				mode: "token",
				hostname: "app.example.com",
				token: undefined,
				protocol: "http2",
				binary: "cloudflared",
			});
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("rejects an unknown mode, transport or key instead of falling back", async () => {
		const isolated = await isolatedDir();
		try {
			// Deliberately ill-typed overrides: the resolver must object, so
			// its argument is loosened for this test only.
			const resolveLoose = resolveTunnelConfig as (options: {
				cwd: string;
				overrides: Record<string, unknown>;
			}) => Promise<unknown>;
			const invalid = (cloudflared: Record<string, unknown>): Record<string, unknown> => ({
				provider: "cloudflared",
				cloudflared,
			});
			expect(
				await issuesOf(() =>
					resolveLoose({ cwd: isolated, overrides: invalid({ mode: "fast" }) }),
				),
			).toEqual(["cloudflared/mode: Expected union value"]);
			expect(
				await issuesOf(() =>
					resolveLoose({
						cwd: isolated,
						overrides: invalid({ protocol: "http3" }),
					}),
				),
			).toEqual(["cloudflared/protocol: Expected union value"]);
			expect(
				await issuesOf(() =>
					resolveLoose({
						cwd: isolated,
						overrides: invalid({ hostname: "app.example.com", region: "us" }),
					}),
				),
			).toEqual(["cloudflared/region: Unexpected property"]);
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("refuses the section without its provider", async () => {
		const isolated = await isolatedDir();
		try {
			const issues = await issuesOf(() =>
				resolveTunnelConfig({
					cwd: isolated,
					overrides: { cloudflared: { protocol: "quic" } },
				}),
			);
			expect(issues).toEqual([
				'cloudflared: the cloudflared section needs "provider: \\"cloudflared\\"" — provider is "opentunnel"',
			]);
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("requires the hostname in token mode and takes it from the file", async () => {
		const isolated = await isolatedDir();
		try {
			const issues = await issuesOf(() =>
				resolveTunnelConfig({
					cwd: isolated,
					overrides: { provider: "cloudflared", cloudflared: { mode: "token" } },
				}),
			);
			expect(issues[0]).toContain(
				'cloudflared.hostname: required when cloudflared.mode is "token"',
			);

			await fs.writeFile(
				path.join(isolated, "vkma-tunnel.config.json"),
				JSON.stringify({
					provider: "cloudflared",
					cloudflared: { hostname: "app.example.com" },
				}),
				"utf8",
			);
			const { config } = await resolveTunnelConfig({
				cwd: isolated,
				overrides: { cloudflared: { mode: "token", token: "secret-token" } },
			});
			expect(config.cloudflared).toMatchObject({
				mode: "token",
				hostname: "app.example.com",
				token: "secret-token",
			});
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("serves one public hostname: another route is a config error", async () => {
		const isolated = await isolatedDir();
		try {
			const issues = await issuesOf(() =>
				resolveTunnelConfig({
					cwd: isolated,
					overrides: { provider: "cloudflared", cloudflared: {}, route: "app" },
				}),
			);
			expect(issues).toEqual([
				"route: cloudflared serves one public hostname: route must be @",
			]);
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});

	it("keeps opentunnel free of the cloudflared rules", async () => {
		const isolated = await isolatedDir();
		try {
			const { config } = await resolveTunnelConfig({
				cwd: isolated,
				overrides: { provider: "opentunnel", route: "app" },
			});
			expect(config.route).toBe("app");
			expect(config.cloudflared).toBeUndefined();
			expect(isTunnelError(new ConfigValidationError([]))).toBe(true);
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});
});
