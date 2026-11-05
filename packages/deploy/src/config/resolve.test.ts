import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigValidationError, DeployError } from "../errors.ts";
import { makeTempDir } from "../test-utils.ts";
import { assertDeployReadiness, resolveConfig, findConfigFile } from "./resolve.ts";

const CLEAN_ENV = {
	HOME: "/tmp/opencode/vkma-fake-home",
	PATH: process.env["PATH"],
};

let root: string;

beforeEach(async () => {
	root = await makeTempDir("vkma-resolve-");
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

async function write(dir: string, name: string, content: string): Promise<string> {
	const filePath = path.join(dir, name);
	await fs.writeFile(filePath, content, "utf8");
	return filePath;
}

describe("findConfigFile", () => {
	it("finds nothing in an empty tree", () => {
		expect(findConfigFile(root)).toBeUndefined();
	});

	it("prefers our config over legacy at the same level", async () => {
		await write(root, "vk-hosting-config.json", "{}");
		await write(root, "vkma-deploy.config.json", "{}");
		expect(path.basename(findConfigFile(root) ?? "")).toBe("vkma-deploy.config.json");
	});

	it("walks up and finds the closest file regardless of type", async () => {
		const nested = path.join(root, "apps", "foo");
		await fs.mkdir(nested, { recursive: true });
		await write(path.join(root, "apps"), "vkma-deploy.config.json", "{}");
		await write(root, "vk-hosting-config.json", "{}");
		const found = findConfigFile(nested);
		expect(found).toBe(path.join(root, "apps", "vkma-deploy.config.json"));
	});
});

describe("resolveConfig", () => {
	it("resolves defaults when no config file exists", async () => {
		const { config, meta } = await resolveConfig({
			cwd: root,
			env: { ...CLEAN_ENV, VKMA_APP_ID: "123", VKMA_ACCESS_TOKEN: "tok-123456789" },
			overrides: { staticPath: "./build", endpoints: { web: "index.html" } },
		});
		expect(config.appId).toBe(123);
		expect(config.accessToken).toBe("tok-123456789");
		expect(config.staticPath).toBe("./build");
		expect(meta.configPath).toBeUndefined();
	});

	it("resolves without appId — appId is operation-level, not resolution-level", async () => {
		const { config } = await resolveConfig({
			cwd: root,
			env: CLEAN_ENV,
			overrides: { bundle: "./b.zip", endpoints: { web: "index.html" } },
		});
		expect(config.appId).toBeUndefined();
	});

	it("resolves without deploy completeness (staticPath/endpoints are deploy-level)", async () => {
		const { config } = await resolveConfig({
			cwd: root,
			env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
		});
		expect(config.appId).toBe(1);
		expect(config.staticPath).toBeUndefined();
		expect(config.endpoints).toEqual({});
	});

	it("loads our json config and applies defaults", async () => {
		await write(
			root,
			"vkma-deploy.config.json",
			JSON.stringify({
				$schema: "https://example.com/x.json",
				appId: 42,
				staticPath: "./build",
				endpoints: { web: "index.html" },
				proxy: "http://proxy.corp:8080",
			}),
		);
		const { config, meta } = await resolveConfig({ cwd: root, env: CLEAN_ENV });
		expect(config.appId).toBe(42);
		expect(config.proxy).toBe("http://proxy.corp:8080");
		// $schema is editor metadata: it must not haunt meta.sources.
		expect((meta.sources as Record<string, string | undefined>)["$schema"]).toBeUndefined();
		expect(config.staticPath).toBe("./build");
		// Configured platforms pass through unchanged; nothing is injected
		// for the others (only configured ones are preflight-checked/sent).
		expect(config.endpoints).toEqual({ web: "index.html" });
		expect(config.environment).toBe("both");
		// Update flags have no default: unset stays undefined (the CLI
		// triage prompts or fails; the wire omits the params).
		expect(config.updateProd).toBeUndefined();
		expect(config.updateDev).toBeUndefined();
		expect(config.apiVersion).toBe("5.199");
		expect(meta.configPath).toBeDefined();
		expect(meta.legacy).toBe(false);
		expect(meta.sources["appId"]).toBe("config");
	});

	it("allows pinning the upstream API version 5.131", async () => {
		await write(
			root,
			"vkma-deploy.config.json",
			JSON.stringify({
				appId: 1,
				staticPath: "./build",
				endpoints: { web: "index.html" },
				apiVersion: "5.131",
			}),
		);
		const { config } = await resolveConfig({ cwd: root, env: CLEAN_ENV });
		expect(config.apiVersion).toBe("5.131");
	});

	it("strips trailing slash from staticPath (upstream #18/#31)", async () => {
		await write(
			root,
			"vkma-deploy.config.json",
			JSON.stringify({ appId: 1, staticPath: "./build/", endpoints: { web: "index.html" } }),
		);
		const { config } = await resolveConfig({ cwd: root, env: CLEAN_ENV });
		expect(config.staticPath).toBe("./build");
	});

	it("loads a TS config with type-only imports and a default export", async () => {
		// Bare imports of @vkma.dev/deploy inside a temp dir cannot resolve, so
		// this covers the strip+import mechanics; defineDeployConfig itself is
		// an identity function tested separately.
		await write(
			root,
			"vkma-deploy.config.ts",
			`
				export interface Shape { appId: number; staticPath: string }
				const config: Shape = { appId: 77, staticPath: "./dist", endpoints: { web: "index.html" } };
				export default config;
			`,
		);
		const { config } = await resolveConfig({ cwd: root, env: CLEAN_ENV });
		expect(config.appId).toBe(77);
		expect(config.staticPath).toBe("./dist");
	});

	it("supports factory default exports in TS configs", async () => {
		await write(
			root,
			"vkma-deploy.config.mts",
			`export default () => ({ appId: 8, staticPath: "./out", endpoints: { web: "index.html" } });`,
		);
		const { config } = await resolveConfig({ cwd: root, env: CLEAN_ENV });
		expect(config.appId).toBe(8);
	});

	it("loads a legacy vk-hosting-config.json with mapping and warnings", async () => {
		await write(
			root,
			"vk-hosting-config.json",
			JSON.stringify({
				app_id: 10,
				static_path: "./build",
				endpoints: { mobile: "m.html" },
				update_prod: 1,
				update_dev: 0,
				test_group_name: "qa",
				debug: true,
				noprompt: true,
				who_is_this: "x",
			}),
		);
		const { config, meta } = await resolveConfig({ cwd: root, env: CLEAN_ENV });
		expect(meta.legacy).toBe(true);
		expect(config.appId).toBe(10);
		expect(config.staticPath).toBe("./build");
		expect(config.updateProd).toBe(true);
		expect(config.updateDev).toBe(false);
		expect(config.testGroupName).toBe("qa");
		expect(config.endpoints).toEqual({ mobile: "m.html" });
		expect(meta.warnings.some(w => w.includes("debug"))).toBe(true);
		expect(meta.warnings.some(w => w.includes("who_is_this"))).toBe(true);
	});

	it("rejects unknown fields in new-format configs instead of ignoring them", async () => {
		// A snake_case typo in a new-format file must fail naming the key,
		// not silently deploy with defaults (legacy files are exempt: their
		// unknown fields produce warnings instead).
		await write(
			root,
			"vkma-deploy.config.json",
			JSON.stringify({ appId: 1, static_path: "./build" }),
		);
		await expect(resolveConfig({ cwd: root, env: CLEAN_ENV })).rejects.toThrow(
			/static_path|Unexpected|unrecognized|property/i,
		);
	});

	it("rejects invalid legacy update_prod values (upstream validated 0/1/bool)", async () => {
		await write(
			root,
			"vk-hosting-config.json",
			JSON.stringify({ app_id: 1, static_path: "./b", update_prod: 5 }),
		);
		await expect(resolveConfig({ cwd: root, env: CLEAN_ENV })).rejects.toBeInstanceOf(
			DeployError,
		);
	});

	it("env beats config, overrides beat env", async () => {
		await write(
			root,
			"vkma-deploy.config.json",
			JSON.stringify({
				appId: 1,
				staticPath: "./a",
				endpoints: { web: "index.html" },
				environment: "dev",
			}),
		);
		const env = {
			...CLEAN_ENV,
			VKMA_APP_ID: "2",
			MINI_APPS_APP_ID: "9",
			VKMA_ENVIRONMENT: "production",
		};
		const { config, meta } = await resolveConfig({
			cwd: root,
			env,
			overrides: { staticPath: "./z", endpoints: { web: "index.html" } },
		});
		expect(config.appId).toBe(2);
		expect(config.environment).toBe("production");
		expect(config.staticPath).toBe("./z");
		expect(meta.sources["appId"]).toBe("env");
		expect(meta.sources["staticPath"]).toBe("override");
		expect(meta.sources["environment"]).toBe("env");
	});

	it("MINI_APPS_* aliases work when VKMA_* is absent", async () => {
		const env = {
			...CLEAN_ENV,
			MINI_APPS_APP_ID: "5",
			MINI_APPS_ACCESS_TOKEN: "legacy-token-123",
			MINI_APPS_ENVIRONMENT: "prod",
			CI_URLS: "1",
		};
		const { config, meta } = await resolveConfig({
			cwd: root,
			env,
			overrides: { bundle: "./b.zip", endpoints: { web: "index.html" } },
		});
		expect(config.appId).toBe(5);
		expect(config.accessToken).toBe("legacy-token-123");
		expect(config.environment).toBe("production");
		expect(meta.ciUrls).toBe(true);
	});

	it("fails loudly on a bad env app id (upstream threw too, but vaguely)", async () => {
		await expect(
			resolveConfig({
				cwd: root,
				env: { ...CLEAN_ENV, MINI_APPS_APP_ID: "abc" },
				overrides: { bundle: "./b.zip" },
			}),
		).rejects.toThrow(/MINI_APPS_APP_ID/);
	});

	it("fails loudly on a bad env environment (upstream silently fell back to both)", async () => {
		await expect(
			resolveConfig({
				cwd: root,
				env: { ...CLEAN_ENV, MINI_APPS_ENVIRONMENT: "staging" },
				overrides: { appId: 1, bundle: "./b.zip" },
			}),
		).rejects.toThrow(/environment/);
	});

	it("aggregates multiple validation issues", async () => {
		await write(
			root,
			"vkma-deploy.config.json",
			JSON.stringify({ appId: "nope", staticPath: 12 }),
		);
		const error = await resolveConfig({ cwd: root, env: CLEAN_ENV }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ConfigValidationError);
		const message = (error as ConfigValidationError).message;
		expect(message).toMatch(/appId/);
		expect(message).toMatch(/staticPath/);
	});

	it("explicit configPath bypasses discovery and missing files fail clearly", async () => {
		await expect(
			resolveConfig({ cwd: root, env: CLEAN_ENV, configPath: path.join(root, "nope.json") }),
		).rejects.toThrow(/Config file not found/);
	});

	it("rejects proxy URLs that are not http(s) at the schema level", async () => {
		await expect(
			resolveConfig({
				cwd: root,
				env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
				overrides: {
					staticPath: "./build",
					endpoints: { web: "index.html" },
					proxy: "socks5://proxy:1080",
				},
			}),
		).rejects.toThrow(/proxy/);
	});

	it("rejects testGroupName with production environment", async () => {
		await expect(
			resolveConfig({
				cwd: root,
				env: CLEAN_ENV,
				overrides: {
					appId: 1,
					staticPath: "./b",
					endpoints: { web: "index.html" },
					testGroupName: "qa",
					environment: "production",
				},
			}),
		).rejects.toThrow(/test group/i);
	});
});

describe("assertDeployReadiness", () => {
	it("treats whitespace-only staticPath/bundle as missing (never zips cwd)", async () => {
		await write(root, "vkma-deploy.config.json", JSON.stringify({ staticPath: " " }));
		const { config } = await resolveConfig({ cwd: root, env: CLEAN_ENV });
		expect(config.staticPath).toBeUndefined();
		expect(() => assertDeployReadiness(config, { hasConfigFile: true })).toThrow(
			/staticPath is required/,
		);
	});

	it("rejects empty endpoint paths at the schema level", async () => {
		await expect(
			resolveConfig({
				cwd: root,
				env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
				overrides: { staticPath: "./build", endpoints: { web: "" } },
			}),
		).rejects.toThrow(/web/);
	});
	it("requires appId pointing at init when no config file was found", async () => {
		const { config } = await resolveConfig({ cwd: root, env: CLEAN_ENV });
		expect(config.appId).toBeUndefined();
		expect(() => assertDeployReadiness(config, { hasConfigFile: false, cwd: root })).toThrow(
			/no config file found/,
		);
		expect(() => assertDeployReadiness(config, { hasConfigFile: false, cwd: root })).toThrow(
			/vkma-deploy init/,
		);
	});

	it("requires appId and names the config file when one was found", async () => {
		await write(root, "vkma-deploy.config.json", JSON.stringify({ staticPath: "./build" }));
		const { config, meta } = await resolveConfig({ cwd: root, env: CLEAN_ENV });
		expect(() =>
			assertDeployReadiness(config, {
				hasConfigFile: meta.configPath !== undefined,
				configPath: meta.configPath,
			}),
		).toThrow(new RegExp((meta.configPath ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	});

	it("accepts a config with staticPath and endpoints", async () => {
		const { config } = await resolveConfig({
			cwd: root,
			env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
			overrides: { staticPath: "./build", endpoints: { web: "index.html" } },
		});
		expect(() => assertDeployReadiness(config)).not.toThrow();
	});

	it("accepts a bundle-only config", async () => {
		const { config } = await resolveConfig({
			cwd: root,
			env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
			overrides: { bundle: "./b.zip", endpoints: { web: "index.html" } },
		});
		expect(() => assertDeployReadiness(config)).not.toThrow();
	});

	it("requires staticPath or bundle", async () => {
		const { config } = await resolveConfig({
			cwd: root,
			env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
		});
		expect(() => assertDeployReadiness(config)).toThrow(/staticPath is required/);
	});

	it("requires an endpoints block with at least one platform", async () => {
		const { config } = await resolveConfig({
			cwd: root,
			env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
			overrides: { staticPath: "./build" },
		});
		expect(() => assertDeployReadiness(config)).toThrow(/at least one platform/);
	});

	it("rejects an empty endpoints block", async () => {
		const { config } = await resolveConfig({
			cwd: root,
			env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
			overrides: { staticPath: "./build", endpoints: {} },
		});
		expect(() => assertDeployReadiness(config)).toThrow(/at least one platform/);
	});

	it("rejects both staticPath and bundle", async () => {
		const { config } = await resolveConfig({
			cwd: root,
			env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
			overrides: {
				staticPath: "./build",
				endpoints: { web: "index.html" },
				bundle: "./b.zip",
			},
		});
		expect(() => assertDeployReadiness(config)).toThrow(/mutually exclusive/);
	});

	it("hints at the legacy field name for legacy configs", async () => {
		const { config } = await resolveConfig({
			cwd: root,
			env: { ...CLEAN_ENV, VKMA_APP_ID: "1" },
		});
		expect(() => assertDeployReadiness(config, { legacy: true })).toThrow(/static_path/);
	});
});
