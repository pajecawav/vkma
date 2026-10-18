import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG_DEFAULTS, type ResolvedConfig } from "./config/schema.ts";
import { DeployError } from "./errors.ts";
import { endpointFilePath, preflight } from "./preflight.ts";

let root: string;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join("/tmp/opencode", "vkma-preflight-"));
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

function makeConfig(overrides: Partial<ResolvedConfig>): ResolvedConfig {
	return {
		appId: 1,
		staticPath: "./build",
		endpoints: { ...CONFIG_DEFAULTS.endpoints },
		environment: "both",
		updateProd: true,
		updateDev: true,
		apiHost: CONFIG_DEFAULTS.apiHost,
		oauthHost: CONFIG_DEFAULTS.oauthHost,
		apiVersion: CONFIG_DEFAULTS.apiVersion,
		oauthClientId: CONFIG_DEFAULTS.oauthClientId,
		queueTimeoutSec: CONFIG_DEFAULTS.queueTimeoutSec,
		...overrides,
	};
}

async function makeBuildDir(): Promise<void> {
	await fs.mkdir(path.join(root, "build"), { recursive: true });
	await fs.writeFile(path.join(root, "build", "index.html"), "ok");
	await fs.writeFile(path.join(root, "build", "mobile.html"), "ok");
}

describe("endpointFilePath", () => {
	it("mirrors upstream pathname semantics including query stripping", () => {
		expect(endpointFilePath("/build", "index.html")).toBe(path.join("/build", "/index.html"));
		expect(endpointFilePath("/build", "index.html?v=9")).toBe(
			path.join("/build", "/index.html"),
		);
	});
});

describe("preflight", () => {
	it("passes with a valid static directory and endpoint files", async () => {
		await makeBuildDir();
		const result = await preflight(makeConfig({}), root);
		expect(result.staticPath).toBe(path.join(root, "build"));
		expect(result.endpointFiles.map(entry => entry.platform).toSorted()).toEqual([
			"mobile",
			"mvk",
			"web",
		]);
	});

	it("fails with an actionable error when staticPath is missing (upstream zipped ./undefined)", async () => {
		const error = await preflight(makeConfig({ staticPath: "./nope" }), root).catch(
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(DeployError);
		expect((error as DeployError).code).toBe("E_NO_STATIC_PATH");
		expect((error as DeployError).message).toContain("./undefined");
	});

	it("fails when staticPath is a file, not a directory", async () => {
		await fs.writeFile(path.join(root, "file.txt"), "x");
		await expect(preflight(makeConfig({ staticPath: "./file.txt" }), root)).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).code === "E_NO_STATIC_PATH",
		);
	});

	it("names the platform and endpoint when an endpoint file is missing", async () => {
		await makeBuildDir();
		await fs.rm(path.join(root, "build", "mobile.html"));
		const config = makeConfig({
			endpoints: { mobile: "mobile.html", mvk: "index.html", web: "index.html" },
		});
		await expect(preflight(config, root)).rejects.toThrow(/"mobile".*mobile\.html/);
	});

	it("strips query strings when checking endpoint files (upstream semantics)", async () => {
		await makeBuildDir();
		const config = makeConfig({
			endpoints: { mobile: "index.html?cache=1", mvk: "index.html", web: "index.html" },
		});
		await expect(preflight(config, root)).resolves.toBeDefined();
	});

	it("validates a prebuilt bundle instead", async () => {
		await fs.writeFile(path.join(root, "b.zip"), "zip");
		const result = await preflight(
			makeConfig({ staticPath: undefined, bundle: "./b.zip" }),
			root,
		);
		expect(result.bundlePath).toBe(path.join(root, "b.zip"));
		expect(result.endpointFiles).toEqual([]);
	});

	it("fails when the bundle file is missing", async () => {
		await expect(
			preflight(makeConfig({ staticPath: undefined, bundle: "./missing.zip" }), root),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).code === "E_NO_BUNDLE");
	});
});
