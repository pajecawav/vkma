import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { createFetchSpy, instantSleep, route, type FetchSpy } from "../test-utils.ts";
import { deploy, type DeployEvent, type DeployOptions } from "./flow.ts";

function encodeAscii(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
	outer: for (let i = from; i <= haystack.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) {
				continue outer;
			}
		}
		return i;
	}
	return -1;
}

function lastIndexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
	outer: for (let i = haystack.length - needle.length; i >= 0; i--) {
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) {
				continue outer;
			}
		}
		return i;
	}
	return -1;
}

let root: string;
let events: DeployEvent[];
let spy: FetchSpy;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join("/tmp/opencode", "vkma-flow-"));
	events = [];
	await fs.mkdir(path.join(root, "build", "assets"), { recursive: true });
	await fs.writeFile(path.join(root, "build", "index.html"), "<html>app</html>");
	await fs.writeFile(path.join(root, "build", "assets", "app.js"), "export default 1");
	await fs.writeFile(
		path.join(root, "vkma-deploy.config.json"),
		JSON.stringify({ appId: 42, staticPath: "./build" }),
	);

	spy = createFetchSpy(
		route([
			[
				"getGoHostingUploadServer",
				() => ({ body: { response: { upload_url: "https://upload.vk/ticket" } } }),
			],
			["upload.vk/ticket", () => ({ body: { ticket_id: "T" } })],
			["createGoHostingTask", () => ({ body: { response: { version: 555 } } })],
			[
				"subscribeToHostingQueue",
				() => ({
					body: {
						response: { base_url: "https://queue.vk/", key: "k", ts: 1, app_id: 9 },
					},
				}),
			],
			[
				"act=a_check",
				() => ({
					body: {
						ts: 2,
						events: [
							{ data: { type: "success", code: 200 } },
							{
								data: {
									type: "success",
									code: 201,
									message: {
										is_production: true,
										urls: { iframe_secure_url: "https://p" },
									},
								},
							},
							{
								data: {
									type: "success",
									code: 201,
									message: {
										is_production: false,
										urls: { iframe_secure_url: "https://d" },
									},
								},
							},
						],
					},
				}),
			],
		]),
	);
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

function baseOptions(): DeployOptions {
	return {
		cwd: root,
		env: {
			HOME: path.join(root, "home"),
			PATH: process.env["PATH"],
			VKMA_ACCESS_TOKEN: "flow-token-1",
		},
		fetchImpl: spy.fetchImpl,
		sleep: instantSleep,
		backoffBaseMs: 0,
		onEvent: event => events.push(event),
	};
}

describe("deploy()", () => {
	it("runs the full flow with upstream-compatible wire params", async () => {
		const result = await deploy(undefined, baseOptions());

		expect(result.dryRun).toBe(false);
		expect(result.version).toBe(555);
		expect(result.appId).toBe(42);
		expect(result.urls.production).toEqual({ iframe_secure_url: "https://p" });
		expect(result.urls.dev).toEqual({ iframe_secure_url: "https://d" });
		expect(result.durationMs).toBeGreaterThanOrEqual(0);

		const order = spy.calls.map(call => {
			if (call.url.includes("getGoHostingUploadServer")) {
				return "upload-server";
			}
			if (call.url.includes("upload.vk/ticket")) {
				return "upload";
			}
			if (call.url.includes("createGoHostingTask")) {
				return "create-task";
			}
			if (call.url.includes("subscribeToHostingQueue")) {
				return "subscribe";
			}
			if (call.url.includes("act=a_check")) {
				return "poll";
			}
			return "other";
		});
		expect(order.slice(0, 5)).toEqual([
			"upload-server",
			"upload",
			"create-task",
			"subscribe",
			"poll",
		]);

		const serverUrl = spy.calls[0]?.url ?? "";
		expect(serverUrl).toContain("app_id=42");
		expect(serverUrl).toContain("environment=3");
		// Upstream parity: no update flags / endpoints in the config -> none
		// sent; the server applies its own defaults.
		expect(serverUrl).not.toContain("update_prod");
		expect(serverUrl).not.toContain("update_dev");
		expect(serverUrl).not.toContain("endpoint_");
		expect(serverUrl).toContain("v=5.199");
		expect(serverUrl).toContain("cli_version=2");

		const uploadCall = spy.calls[1];
		const uploadBody = new TextDecoder().decode(uploadCall?.bodyBytes ?? new Uint8Array());
		expect(uploadBody).toContain("build.zip");

		// Extract the zip payload from the multipart envelope and verify it.
		const raw = uploadCall?.bodyBytes ?? new Uint8Array();
		const headEnd = indexOfBytes(raw, encodeAscii("\r\n\r\n")) + 4;
		const tailStart = lastIndexOfBytes(raw, encodeAscii("\r\n--"));
		const zipBytes = raw.slice(headEnd, tailStart);
		const unzipped = unzipSync(zipBytes);
		expect(new TextDecoder().decode(unzipped["index.html"] ?? new Uint8Array(0))).toBe(
			"<html>app</html>",
		);
		expect(new TextDecoder().decode(unzipped["assets/app.js"] ?? new Uint8Array(0))).toBe(
			"export default 1",
		);

		const taskUrl = spy.calls[2]?.url ?? "";
		const uploadResponseB64 = Buffer.from(JSON.stringify({ ticket_id: "T" }), "utf8").toString(
			"base64",
		);
		expect(taskUrl).toContain(`upload_response=${encodeURIComponent(uploadResponseB64)}`);
	});

	it("maps environment dev to bitmask 1 and update flags to 0/1", async () => {
		await deploy(undefined, {
			...baseOptions(),
			overrides: { environment: "dev", updateProd: false, updateDev: true },
		});
		const serverUrl = spy.calls[0]?.url ?? "";
		expect(serverUrl).toContain("environment=1");
		// Explicit flags are sent with their 0/1 value.
		expect(serverUrl).toContain("update_prod=0");
		expect(serverUrl).toContain("update_dev=1");
	});

	it("sends test_group_name when configured", async () => {
		await deploy(undefined, { ...baseOptions(), overrides: { testGroupName: "qa" } });
		expect(spy.calls[0]?.url).toContain("test_group_name=qa");
	});

	it("sends endpoint_* params only for configured platforms (upstream parity)", async () => {
		await fs.writeFile(path.join(root, "build", "m.html"), "m");
		await fs.writeFile(path.join(root, "build", "w.html"), "w");
		await deploy(undefined, {
			...baseOptions(),
			overrides: { endpoints: { mobile: "m.html", web: "w.html" } },
		});
		const serverUrl = spy.calls[0]?.url ?? "";
		expect(serverUrl).toContain("endpoint_mobile=m.html");
		expect(serverUrl).toContain("endpoint_web=w.html");
		expect(serverUrl).not.toContain("endpoint_mvk");
	});

	it("honors apiVersion 5.131 pinned for upstream parity", async () => {
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", apiVersion: "5.131" }),
		);
		await deploy(undefined, baseOptions());
		expect(spy.calls[0]?.url).toContain("v=5.131");
	});

	it("accepts an inline config object instead of discovery", async () => {
		await deploy({ appId: 42, staticPath: "./build" }, baseOptions());
		expect(spy.calls.length).toBeGreaterThan(0);
	});

	it("dry-run performs zero network calls", async () => {
		const result = await deploy(undefined, { ...baseOptions(), dryRun: true });
		expect(result.dryRun).toBe(true);
		expect(spy.calls.length).toBe(0);
		expect(result.bundleBytes).toBeGreaterThan(0);
	});

	it("dry-run works without any token", async () => {
		const options = baseOptions();
		const env = { ...options.env };
		delete env["VKMA_ACCESS_TOKEN"];
		await deploy(undefined, { ...options, env, dryRun: true });
	});

	it("uses the upstream configstore token as a drop-in fallback", async () => {
		const home = path.join(root, "home");
		const vault = path.join(
			home,
			".config",
			"configstore",
			"@vkontakte",
			"vk-miniapps-deploy.json",
		);
		await fs.mkdir(path.dirname(vault), { recursive: true });
		await fs.writeFile(
			vault,
			JSON.stringify({ access_token: "legacy-vault-token", expires_in: 0 }),
			"utf8",
		);

		const options = baseOptions();
		const env = { ...options.env };
		delete env["VKMA_ACCESS_TOKEN"];
		const result = await deploy(undefined, { ...options, env });

		expect(result.version).toBe(555);
		expect(spy.calls[0]?.url).toContain(encodeURIComponent("legacy-vault-token"));
		const tokenEvent = events.find(event => event.type === "token:resolved");
		expect(tokenEvent).toMatchObject({
			type: "token:resolved",
			source: "upstream-configstore",
		});
	});

	it("fails with a user error and login hint when no token exists anywhere", async () => {
		const options = baseOptions();
		const env = { ...options.env };
		delete env["VKMA_ACCESS_TOKEN"];
		const error = await deploy(undefined, { ...options, env }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(DeployError);
		expect((error as DeployError).kind).toBe("user");
		expect((error as DeployError).message).toMatch(/vkma-deploy login/);
	});

	it("emits a structured event stream", async () => {
		await deploy(undefined, baseOptions());
		const types = events.map(event => event.type);
		expect(types).toContain("config:resolved");
		expect(types).toContain("token:resolved");
		expect(types).toContain("preflight:done");
		expect(types).toContain("zip:done");
		expect(types).toContain("upload:start");
		expect(types).toContain("upload:progress");
		expect(types).toContain("upload:done");
		expect(types).toContain("task:created");
		expect(types).toContain("deploy:success");
	});

	it("supports a prebuilt bundle file", async () => {
		await fs.rm(path.join(root, "vkma-deploy.config.json"));
		await fs.writeFile(path.join(root, "prebuilt.zip"), "PK-zip-content");
		await deploy(undefined, {
			...baseOptions(),
			overrides: { appId: 42, bundle: "./prebuilt.zip" },
		});
		const uploadBody = new TextDecoder().decode(spy.calls[1]?.bodyBytes ?? new Uint8Array());
		expect(uploadBody).toContain("PK-zip-content");
	});

	it("propagates queue timeouts as network errors", async () => {
		const hanging = createFetchSpy(async url => {
			if (url.includes("getGoHostingUploadServer")) {
				return { body: { response: { upload_url: "https://upload.vk/ticket" } } };
			}
			if (url.includes("upload.vk/ticket")) {
				return { body: { ticket_id: "T" } };
			}
			if (url.includes("createGoHostingTask")) {
				return { body: { response: { version: 556 } } };
			}
			if (url.includes("subscribeToHostingQueue")) {
				return {
					body: {
						response: { base_url: "https://queue.vk/", key: "k", ts: 1, app_id: 9 },
					},
				};
			}
			// Simulate the long-poll cadence instead of a hot loop.
			await new Promise(resolve => setTimeout(resolve, 25));
			return { body: { ts: Date.now(), events: [] } };
		});
		spy = hanging;
		const error = await deploy(undefined, {
			...baseOptions(),
			overrides: { queueTimeoutSec: 1 },
		}).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(DeployError);
		expect((error as DeployError).code).toBe("E_QUEUE_TIMEOUT");
	});

	it("reads the legacy vk-hosting-config.json as a drop-in", async () => {
		await fs.rm(path.join(root, "vkma-deploy.config.json"));
		await fs.writeFile(
			path.join(root, "vk-hosting-config.json"),
			JSON.stringify({ app_id: 42, static_path: "./build", update_dev: 0 }),
		);
		await deploy(undefined, baseOptions());
		const serverUrl = spy.calls[0]?.url ?? "";
		expect(serverUrl).toContain("app_id=42");
		expect(serverUrl).toContain("update_dev=0");
	});
});
