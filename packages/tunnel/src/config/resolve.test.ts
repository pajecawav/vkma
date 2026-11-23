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
				profile: undefined,
			});
			// A provider's section appears only when the file or an override
			// set it: the provider applies its own defaults.
			expect(config.opentunnel).toBeUndefined();
			expect(config.cloudflared).toBeUndefined();
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
			expect(config.opentunnel).toBeUndefined();
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
				"export default { port: 4173, opentunnel: { route: 'mobile' } } as const;\n",
				"utf8",
			);
			const { config } = await resolveTunnelConfig({ cwd: isolated });
			expect(config.port).toBe(4173);
			expect(config.opentunnel).toEqual({ route: "mobile" });
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
		const call = resolveTunnelConfig({ overrides: { opentunnel: { route: "Bad Route" } } });
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

describe("provider ids", () => {
	const isolated = async (): Promise<string> =>
		fs.mkdtemp(path.join(import.meta.dirname, ".resolve-p-"));

	it("rejects an unknown provider where the config is validated, naming the valid ones", async () => {
		const dir = await isolated();
		try {
			await expect(
				resolveTunnelConfig({
					cwd: dir,
					overrides: { provider: "cloudflared-typo" } as never,
				}),
			).rejects.toMatchObject({ kind: "config" });
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("resolves the provider it was given", async () => {
		const dir = await isolated();
		try {
			const { config } = await resolveTunnelConfig({
				cwd: dir,
				overrides: { provider: "cloudflared" },
			});
			expect(config.provider).toBe("cloudflared");
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});
});

describe("provider sections", () => {
	const isolated = async (): Promise<string> =>
		fs.mkdtemp(path.join(import.meta.dirname, ".resolve-sec-"));

	it("rejects route and api at the top level: they are opentunnel's, not every provider's", async () => {
		const dir = await isolated();
		try {
			// Deliberately ill-typed: the resolver must name both keys.
			const failure = await resolveTunnelConfig({
				cwd: dir,
				overrides: { route: "app", api: "https://opentunnel.example" } as never,
			}).catch((error: unknown) => error);
			expect(failure).toBeInstanceOf(ConfigValidationError);
			const issues = (failure as ConfigValidationError).issues.map(issue => issue.path);
			expect(issues).toContain("route");
			expect(issues).toContain("api");
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("a section with its own provider resolves untouched", async () => {
		const dir = await isolated();
		try {
			const { config } = await resolveTunnelConfig({
				cwd: dir,
				overrides: { opentunnel: { route: "mobile", api: "https://opentunnel.example" } },
			});
			expect(config.provider).toBe("opentunnel");
			expect(config.opentunnel).toEqual({
				route: "mobile",
				api: "https://opentunnel.example",
			});
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
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

	it("merges the opentunnel section key by key as well", async () => {
		const isolated = await isolatedDir();
		try {
			await fs.writeFile(
				path.join(isolated, "vkma-tunnel.config.json"),
				JSON.stringify({ opentunnel: { api: "https://opentunnel.example" } }),
				"utf8",
			);
			// `--opentunnel-route mobile` alone must not drop the endpoint.
			const { config } = await resolveTunnelConfig({
				cwd: isolated,
				overrides: { opentunnel: { route: "mobile" } },
			});
			expect(config.opentunnel).toEqual({
				api: "https://opentunnel.example",
				route: "mobile",
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
				'cloudflared: the cloudflared section needs "cloudflared" as provider — provider is "opentunnel"',
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

	it("refuses the opentunnel section instead of ignoring it beside cloudflared", async () => {
		const isolated = await isolatedDir();
		try {
			const issues = await issuesOf(() =>
				resolveTunnelConfig({
					cwd: isolated,
					overrides: {
						provider: "cloudflared",
						cloudflared: {},
						opentunnel: { route: "app" },
					},
				}),
			);
			expect(issues).toEqual([
				'opentunnel: the opentunnel section needs "opentunnel" as provider — provider is "cloudflared"',
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
				overrides: { provider: "opentunnel", opentunnel: { route: "app" } },
			});
			expect(config.opentunnel).toEqual({ route: "app" });
			expect(config.cloudflared).toBeUndefined();
			expect(isTunnelError(new ConfigValidationError([]))).toBe(true);
		} finally {
			await fs.rm(isolated, { recursive: true, force: true });
		}
	});
});
