import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveCredentials } from "../credentials/store.ts";
import { createFetchSpy, instantSleep, makeTempDir, route } from "../test-utils.ts";
import { completionScript } from "./completions.ts";
import { main } from "./main.ts";

let root: string;
let out: string[];
let err: string[];
const stdout = { write: (text: string) => out.push(text), isTTY: false };
const stderr = { write: (text: string) => err.push(text) };
const stdin = { isTTY: false };

beforeEach(async () => {
	root = await makeTempDir("vkma-cli-");
	out = [];
	err = [];
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

function env(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
	return { HOME: path.join(root, "home"), PATH: process.env["PATH"], ...extra };
}

function makeProject(): Promise<void> {
	return fs
		.mkdir(path.join(root, "build"), { recursive: true })
		.then(() => fs.writeFile(path.join(root, "build", "index.html"), "ok"));
}

/** Full successful deploy route: upload -> task -> queue -> URL event. */
function deployRoute(): Parameters<typeof route>[0] {
	return [
		[
			"getGoHostingUploadServer",
			() => ({ body: { response: { upload_url: "https://upload.vk/t" } } }),
		],
		["upload.vk/t", () => ({ body: { ticket: 1 } })],
		["createGoHostingTask", () => ({ body: { response: { version: 9 } } })],
		[
			"subscribeToHostingQueue",
			() => ({
				body: { response: { base_url: "https://q.vk/", key: "k", ts: 1, app_id: 1 } },
			}),
		],
		[
			"act=a_check",
			() => ({
				body: {
					ts: 2,
					events: [
						{
							data: {
								type: "success",
								code: 201,
								message: {
									is_production: true,
									urls: { iframe_secure_url: "https://app" },
								},
							},
						},
						{ data: { type: "success", code: 202, message: { environment: "1" } } },
					],
				},
			}),
		],
	];
}

describe("main()", () => {
	it("prints help and exits 0", async () => {
		const code = await main(["--help"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(0);
		expect(out.join("")).toContain("vkma-deploy");
		expect(out.join("")).toContain("vk-hosting-config.json");
	});

	it("prints version", async () => {
		const code = await main(["--version"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(0);
		expect(out.join("")).toMatch(/^\d+\.\d+\.\d+\n$/);
	});

	it("rejects unknown flags with exit 1", async () => {
		const code = await main(["--nope"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(1);
		expect(err.join("")).toContain("Unknown flag");
	});

	it("prints completion scripts", async () => {
		const code = await main(["completions", "bash"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(0);
		expect(out.join("")).toContain("complete -F _vkma_deploy_completions vkma-deploy");
		expect(completionScript("fish")).toContain("complete -c vkma-deploy");
		expect(completionScript("zsh")).toContain("#compdef vkma-deploy");
	});

	it("validates the completions shell", async () => {
		const code = await main(["completions", "tcsh"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(1);
		expect(err.join("")).toContain("bash|zsh|fish");
	});

	it("config command prints the resolved config with redacted token", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({
				appId: 42,
				staticPath: "./build",
				endpoints: { web: "index.html" },
				accessToken: "super-secret-token",
			}),
		);
		const code = await main(["config"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(0);
		const text = out.join("");
		expect(text).toContain("appId");
		expect(text).toContain("42");
		expect(text).not.toContain("super-secret-token");
		expect(text).toContain("***");
	});

	it("config --json emits parseable JSON", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 7, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const code = await main(["config", "--json"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(0);
		const record = JSON.parse(out[0] ?? "{}") as { data: { config: { appId: number } } };
		expect(record.data.config.appId).toBe(7);
	});

	it("--json stays ANSI-free even when stdout is a TTY", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 7, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const ttyOut: string[] = [];
		const code = await main(["config", "--json"], {
			stdout: { write: (text: string) => ttyOut.push(text), isTTY: true },
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(0);
		const text = ttyOut.join("");
		expect(text).not.toContain("\u001b");
		for (const line of text.trim().split("\n")) {
			if (line !== "") {
				expect(() => JSON.parse(line)).not.toThrow();
			}
		}
	});

	it("config command fails on invalid config with exit 1", async () => {
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: "x" }),
		);
		const code = await main(["config"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(1);
		expect(err.join("")).toContain("appId");
	});

	it("logout reports when nothing is stored", async () => {
		const code = await main(["logout"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(0);
		expect(out.join("")).toContain("No stored credentials");
	});

	it("logout warns when the upstream vault still holds a usable token", async () => {
		await saveCredentials({ accessToken: "ours-1234567890" }, env());
		const vault = path.join(
			root,
			"home",
			".config",
			"configstore",
			"@vkontakte",
			"vk-miniapps-deploy.json",
		);
		await fs.mkdir(path.dirname(vault), { recursive: true });
		await fs.writeFile(vault, JSON.stringify({ access_token: "theirs" }), "utf8");
		const code = await main(["logout"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(0);
		expect(out.join("")).toContain("Removed");
		// Warnings render on stderr.
		expect(err.join("")).toContain("upstream");
	});

	it("deploy --dry-run works without a token and emits no network", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(() => ({ body: {} }));
		const code = await main(["--dry-run"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
			fetchImpl: spy.fetchImpl,
		});
		expect(code).toBe(0);
		expect(spy.calls.length).toBe(0);
		expect(out.join("")).toContain("Dry run");
	});

	it("deploy runs end-to-end through the mocked API and exits 0", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(
			route([
				[
					"getGoHostingUploadServer",
					() => ({ body: { response: { upload_url: "https://upload.vk/t" } } }),
				],
				["upload.vk/t", () => ({ body: { ticket: 1 } })],
				["createGoHostingTask", () => ({ body: { response: { version: 9 } } })],
				[
					"subscribeToHostingQueue",
					() => ({
						body: {
							response: { base_url: "https://q.vk/", key: "k", ts: 1, app_id: 1 },
						},
					}),
				],
				[
					"act=a_check",
					() => ({
						body: {
							ts: 2,
							events: [
								{
									data: {
										type: "success",
										code: 201,
										message: {
											is_production: true,
											urls: { iframe_secure_url: "https://app" },
										},
									},
								},
								{
									data: {
										type: "success",
										code: 202,
										message: { environment: "1" },
									},
								},
							],
						},
					}),
				],
			]),
		);
		const code = await main([], {
			stdout,
			stderr,
			stdin,
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		expect(code).toBe(0);
		const text = out.join("");
		expect(text).toContain("Access token: environment variable");
		expect(text).toContain("vk.ru:  https://app");
		expect(text).toContain("version 9");
	});

	it("deploy maps API errors to exit code 3", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(() => ({
			body: { error: { error_code: 15, error_msg: "nope" } },
		}));
		const code = await main([], {
			stdout,
			stderr,
			stdin,
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		expect(code).toBe(3);
		expect(err.join("")).toContain("15");
	});

	it("deploy without a token exits 1 with a login hint", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const code = await main([], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(1);
		expect(err.join("")).toContain("vkma-deploy login");
	});

	it("--json mode keeps stdout parseable end-to-end", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(
			route([
				[
					"getGoHostingUploadServer",
					() => ({ body: { response: { upload_url: "https://upload.vk/t" } } }),
				],
				["upload.vk/t", () => ({ body: { ticket: 1 } })],
				["createGoHostingTask", () => ({ body: { response: { version: 9 } } })],
				[
					"subscribeToHostingQueue",
					() => ({
						body: {
							response: { base_url: "https://q.vk/", key: "k", ts: 1, app_id: 1 },
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
											urls: { iframe_secure_url: "https://app" },
										},
									},
								},
							],
						},
					}),
				],
			]),
		);
		const code = await main(["--json", "--env", "production"], {
			stdout,
			stderr,
			stdin,
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		expect(code).toBe(0);
		const records = out.map(line => JSON.parse(line) as { event: string });
		expect(records.some(record => record.event === "deploy:success")).toBe(true);
		expect(spy.calls[0]?.url).toContain("environment=2");
	});

	it("login saves credentials without printing the token", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(
			route([
				["get_auth_code", () => ({ body: { auth_code: "A", device_id: "D" } })],
				[
					"code_auth_token",
					() => ({ body: { access_token: "fresh-secret-token", expires_in: 100 } }),
				],
			]),
		);
		const home = path.join(root, "home");
		const opened: string[] = [];
		const code = await main(["login"], {
			stdout,
			stderr,
			stdin, // not a TTY -> the browser must NOT open
			env: env({ XDG_CONFIG_HOME: path.join(home, ".config") }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
			openUrl: url => opened.push(url),
		});
		expect(code).toBe(0);
		expect(opened).toEqual([]);
		const text = out.join("");
		expect(text).toContain("Token saved");
		expect(text).not.toContain("fresh-secret-token");
		const stored = JSON.parse(
			await fs.readFile(
				path.join(home, ".config", "vkma", "deploy", "credentials.json"),
				"utf8",
			),
		) as { accessToken: string };
		expect(stored.accessToken).toBe("fresh-secret-token");
	});

	it("empty event-205 confirmation code aborts with exit 130 (no --interactive needed)", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(
			route([
				[
					"getGoHostingUploadServer",
					() => ({ body: { response: { upload_url: "https://upload.vk/ticket" } } }),
				],
				["upload.vk/ticket", () => ({ body: { ticket_id: "T" } })],
				["createGoHostingTask", () => ({ body: { response: { version: 9 } } })],
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
					() => ({ body: { ts: 2, events: [{ data: { type: "success", code: 205 } }] } }),
				],
			]),
		);
		const input = new PassThrough();
		// No --interactive flag: the 205 prompt is unconditional for a real
		// interactive terminal (no CI env — see the CI test below).
		const pending = main([], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			input,
			env: env({ VKMA_ACCESS_TOKEN: "token-1234567890" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		// The first line answers the pre-deploy confirmation (Y). The second
		// line (the declined 205 code) must arrive only after the prompt is
		// actually asking: readline eagerly consumes pre-buffered lines and
		// the second one would be lost before its question exists.
		input.write("\n");
		setTimeout(() => input.write("\n"), 30);
		const code = await pending;
		expect(code).toBe(130);
		// Pretty mode renders aborted errors as "canceled"; the detailed
		// message surfaces in --json mode.
		expect(err.join("")).toContain("canceled");
	});

	it("event 205 in CI (even with a pseudo-TTY) fails fast instead of hanging", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(
			route([
				[
					"getGoHostingUploadServer",
					() => ({ body: { response: { upload_url: "https://upload.vk/ticket" } } }),
				],
				["upload.vk/ticket", () => ({ body: { ticket_id: "T" } })],
				["createGoHostingTask", () => ({ body: { response: { version: 9 } } })],
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
					() => ({ body: { ts: 2, events: [{ data: { type: "success", code: 205 } }] } }),
				],
			]),
		);
		// A CI runner with a pseudo-TTY (docker run -t) used to hang on the
		// readline prompt forever — invariant #5 says CI skips it.
		const code = await main([], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			env: env({ VKMA_ACCESS_TOKEN: "token-1234567890", CI: "1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		expect(code).toBe(1);
		expect(err.join("")).toContain("confirmation code");
	});

	it("--yes never prompts for the event-205 code either (invariant #5)", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(
			route([
				[
					"getGoHostingUploadServer",
					() => ({ body: { response: { upload_url: "https://upload.vk/ticket" } } }),
				],
				["upload.vk/ticket", () => ({ body: { ticket_id: "T" } })],
				["createGoHostingTask", () => ({ body: { response: { version: 9 } } })],
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
					() => ({ body: { ts: 2, events: [{ data: { type: "success", code: 205 } }] } }),
				],
			]),
		);
		const code = await main(["--yes"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			env: env({ VKMA_ACCESS_TOKEN: "token-1234567890" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		expect(code).toBe(1);
		expect(err.join("")).toContain("confirmation code");
	});

	it("event 205 prompts for the code without --interactive and confirms the deploy", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		let polls = 0;
		const spy = createFetchSpy(async (url: string) => {
			if (url.includes("getGoHostingUploadServer")) {
				return { body: { response: { upload_url: "https://upload.vk/t" } } };
			}
			if (url.includes("upload.vk/t")) {
				return { body: { ticket: 1 } };
			}
			if (url.includes("createGoHostingTask")) {
				return { body: { response: { version: 9 } } };
			}
			if (url.includes("subscribeToHostingQueue")) {
				return {
					body: { response: { base_url: "https://q.vk/", key: "k", ts: 1, app_id: 1 } },
				};
			}
			if (url.includes("apps.confirmDeploy")) {
				return { body: { response: { ok: 1 } } };
			}
			if (url.includes("act=a_check")) {
				polls += 1;
				if (polls === 1) {
					return { body: { ts: 2, events: [{ data: { type: "success", code: 205 } }] } };
				}
				return {
					body: {
						ts: 3,
						events: [
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
				};
			}
			return { body: {} };
		});
		const input = new PassThrough();
		const pending = main([], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			input,
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		// First line: pre-deploy confirm (Y). The 205 code arrives deferred —
		// readline eats pre-buffered lines eagerly (see the abort test).
		input.write("\n");
		setTimeout(() => input.write("4242\n"), 30);
		const code = await pending;
		expect(code).toBe(0);
		const confirmUrl =
			spy.calls.find(call => call.url.includes("apps.confirmDeploy"))?.url ?? "";
		expect(confirmUrl).toContain("code=4242");
		const text = out.join("");
		expect(text).toContain("confirm deploy on your phone");
		expect(text).toContain("Confirmation code accepted");
	});

	it("login opens the browser only when stdin is a TTY", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(
			route([
				["get_auth_code", () => ({ body: { auth_code: "TTY", device_id: "D" } })],
				["code_auth_token", () => ({ body: { access_token: "tty-token", expires_in: 1 } })],
			]),
		);
		const opened: string[] = [];
		const code = await main(["login"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			env: env({ XDG_CONFIG_HOME: path.join(root, "home", ".config") }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
			openUrl: url => opened.push(url),
		});
		expect(code).toBe(0);
		expect(opened).toEqual(["https://oauth.vk.ru/code_auth?stage=check&code=TTY&revoke=1"]);
	});

	it("pre-deploy confirm: Enter proceeds with the deploy", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(route(deployRoute()));
		const input = new PassThrough();
		const pending = main([], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			input,
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		input.write("\n");
		const code = await pending;
		expect(code).toBe(0);
		expect(spy.calls.length).toBeGreaterThan(0);
		expect(out.join("")).toContain("Deploy plan:");
		// Warnings render on stderr.
		expect(err.join("")).toContain("production URLs will switch to the new version");
	});

	it("pre-deploy confirm: declining cancels with 130 and zero network calls", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(route(deployRoute()));
		const input = new PassThrough();
		const pending = main([], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			input,
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		input.write("n\n");
		const code = await pending;
		expect(code).toBe(130);
		// Canceled before preflight/zip/upload: nothing touched the network.
		expect(spy.calls.length).toBe(0);
		expect(err.join("")).toContain("canceled");
	});

	it("pre-deploy confirm: CI env var skips the prompt", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(route(deployRoute()));
		// TTY stdin but no input ever written: if the prompt fired here, the
		// test would hang until timeout.
		const code = await main([], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1", CI: "1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		expect(code).toBe(0);
		expect(spy.calls.length).toBeGreaterThan(0);
	});

	it("pre-deploy confirm: --yes skips the prompt", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(route(deployRoute()));
		const code = await main(["--yes"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		expect(code).toBe(0);
		expect(spy.calls.length).toBeGreaterThan(0);
	});

	it("pre-deploy confirm: --dry-run skips the prompt", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(route(deployRoute()));
		const code = await main(["--dry-run"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		expect(code).toBe(0);
		expect(spy.calls.length).toBe(0);
		expect(out.join("")).toContain("Dry run");
	});

	it("pre-deploy confirm: --json logs the plan instead of prompting", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(route(deployRoute()));
		const code = await main(["--json"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			env: env({ VKMA_ACCESS_TOKEN: "cli-token-1" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
		});
		expect(code).toBe(0);
		const records = out
			.filter(line => line.trim() !== "")
			.map(
				line =>
					JSON.parse(line) as {
						event: string;
						message: string;
						data?: { plan?: { appId: number } };
					},
			);
		const plan = records.find(record => record.message === "deploy plan");
		expect(plan?.data?.plan?.appId).toBe(42);
	});

	it("login without appId exits 1 with guidance", async () => {
		const code = await main(["login"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(1);
		const text = err.join("");
		// Login-specific guidance, not the deploy readiness wall.
		expect(text).toContain("appId is required for login");
		expect(text).not.toMatch(/staticPath is required/);
		expect(text).not.toMatch(/at least one platform/);
	});

	it("login --interactive prompts for a missing appId", async () => {
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ staticPath: "./build" }),
		);
		const spy = createFetchSpy(
			route([
				["get_auth_code", () => ({ body: { auth_code: "AC", device_id: "D" } })],
				[
					"code_auth_token",
					() => ({ body: { access_token: "prompted-token", expires_in: 1 } }),
				],
			]),
		);
		const input = new PassThrough();
		const pending = main(["login", "--interactive"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			input,
			env: env({ XDG_CONFIG_HOME: path.join(root, "home", ".config") }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
			openUrl: () => {},
		});
		// PassThrough buffers, so writing before the prompt starts is fine.
		input.write("777\n");
		const code = await pending;
		expect(code).toBe(0);
		expect(spy.calls[0]?.url).toContain("mini_app_id=777");
	});

	it("activates the native proxy when the config has a proxy field", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({
				appId: 42,
				staticPath: "./build",
				endpoints: { web: "index.html" },
				proxy: "http://proxy.corp:8080",
			}),
		);
		const spy = createFetchSpy(route(deployRoute()));
		const proxyCalls: Record<string, string>[] = [];
		const code = await main([], {
			stdout,
			stderr,
			stdin,
			env: env({ VKMA_ACCESS_TOKEN: "token-1234567890" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
			setGlobalProxyFromEnv: envLike => proxyCalls.push(envLike ?? {}),
		});
		expect(code).toBe(0);
		expect(proxyCalls).toEqual([
			{ HTTP_PROXY: "http://proxy.corp:8080", HTTPS_PROXY: "http://proxy.corp:8080" },
		]);
		expect(out.join("")).toContain("Using proxy http://proxy.corp:8080 (from config proxy)");
	});

	it("leaves routing alone when no proxy source is configured", async () => {
		await makeProject();
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 42, staticPath: "./build", endpoints: { web: "index.html" } }),
		);
		const spy = createFetchSpy(route(deployRoute()));
		const proxyCalls: Record<string, string>[] = [];
		const code = await main([], {
			stdout,
			stderr,
			stdin,
			env: env({ VKMA_ACCESS_TOKEN: "token-1234567890" }),
			cwd: root,
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
			setGlobalProxyFromEnv: envLike => proxyCalls.push(envLike ?? {}),
		});
		expect(code).toBe(0);
		expect(proxyCalls).toEqual([]);
		expect(out.join("")).not.toContain("Using proxy");
	});
});
