import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFetchSpy, instantSleep, makeTempDir, route } from "../test-utils.ts";
import { main } from "./main.ts";

let root: string;
let out: string[];
let err: string[];
const stdout = { write: (text: string) => out.push(text), isTTY: false };
const stderr = { write: (text: string) => err.push(text) };
const stdin = { isTTY: false };

beforeEach(async () => {
	root = await makeTempDir("vkma-init-");
	out = [];
	err = [];
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

function env(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
	return { HOME: path.join(root, "home"), PATH: process.env["PATH"], ...extra };
}

async function readConfig(): Promise<string> {
	return fs.readFile(path.join(root, "vkma-deploy.config.ts"), "utf8");
}

describe("init", () => {
	it("creates the config from flags without a TTY", async () => {
		const code = await main(["init", "--app-id", "42"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(0);
		const config = await readConfig();
		expect(config).toBe(
			[
				'import { defineDeployConfig } from "@vkma.dev/deploy";',
				"",
				"export default defineDeployConfig({",
				"\tappId: 42,",
				'\tstaticPath: "./dist",',
				'\tendpoints: { mobile: "index.html", mvk: "index.html", web: "index.html" },',
				'\tenvironment: "both",',
				"});",
				"",
			].join("\n"),
		);
		expect(out.join("")).toContain("Created vkma-deploy.config.ts");
	});

	it("narrows endpoints and environment from flags", async () => {
		const code = await main(["init", "--app-id", "7", "--endpoints", "web", "--env", "dev"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(0);
		const config = await readConfig();
		expect(config).toContain('endpoints: { web: "index.html" },');
		expect(config).toContain('environment: "dev",');
	});

	it("rejects --config", async () => {
		const code = await main(["init", "--config", "other.json", "--app-id", "42"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(1);
		expect(err.join("")).toContain("--config is not supported");
	});

	it("refuses to overwrite an existing config", async () => {
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.json"),
			JSON.stringify({ appId: 1, staticPath: "./build" }),
		);
		const code = await main(["init", "--app-id", "42"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(1);
		expect(err.join("")).toContain("already exists");
		expect(err.join("")).not.toContain("create-app");
	});

	it("points a create-app placeholder (appId: 0) at the existing file", async () => {
		await fs.writeFile(
			path.join(root, "vkma-deploy.config.ts"),
			"export default { appId: 0, staticPath: './dist' };",
		);
		const code = await main(["init"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(1);
		expect(err.join("")).toContain("already exists");
		expect(err.join("")).toContain("create-app");
	});

	it("imports vk-hosting-config.json values, never the token", async () => {
		await fs.writeFile(
			path.join(root, "vk-hosting-config.json"),
			JSON.stringify({
				app_id: 7,
				static_path: "./build",
				endpoints: { web: "main.html" },
				access_token: "legacy-secret-token",
				test_group_name: "qa",
				api_host: "https://api.example/method/",
				update_prod: 1,
				noprompt: true,
			}),
		);
		const code = await main(["init"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(0);
		const config = await readConfig();
		expect(config).toContain("appId: 7,");
		expect(config).toContain('staticPath: "./build",');
		expect(config).toContain('endpoints: { web: "main.html" },');
		expect(config).toContain('testGroupName: "qa",');
		expect(config).toContain('apiHost: "https://api.example/method/",');
		// update flags are per-deploy policy, not scaffold material
		expect(config).not.toContain("updateProd");
		// the token never lands in a file users commit
		expect(config).not.toContain("legacy-secret-token");
		expect(config).not.toContain("accessToken");
		const text = out.join("") + err.join("");
		expect(text).toContain("access_token");
		expect(text).toContain("vkma-deploy login");
		expect(text).toContain("noprompt");
	});

	it("writes bundle instead of staticPath when the legacy config has bundleFile", async () => {
		await fs.writeFile(
			path.join(root, "vk-hosting-config.json"),
			JSON.stringify({
				app_id: 7,
				bundleFile: "./app.zip",
				endpoints: { mvk: "index.html" },
			}),
		);
		const code = await main(["init"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(0);
		const config = await readConfig();
		expect(config).toContain('bundle: "./app.zip",');
		expect(config).not.toContain("staticPath");
	});

	it("fails fast without a TTY and without --app-id, with a paste-ready example", async () => {
		const code = await main(["init"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(1);
		const text = err.join("");
		expect(text).toContain("vkma-deploy init --app-id 123");
		expect(text).toContain("defineDeployConfig");
		expect(text).toContain("no TTY");
	});

	it("rejects init-only flags on other commands", async () => {
		const code = await main(["deploy", "--app-id", "5"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(1);
		expect(err.join("")).toContain("only supported by init");
	});

	it("warns when @vkma.dev/deploy is not a project dependency", async () => {
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({ name: "app", private: true }),
		);
		const code = await main(["init", "--app-id", "42"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(0);
		expect(out.join("") + err.join("")).toContain("@vkma.dev/deploy is not in this project");
	});

	it("stays quiet when the project already depends on @vkma.dev/deploy", async () => {
		await fs.writeFile(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "app",
				private: true,
				devDependencies: { "@vkma.dev/deploy": "^0.1.0" },
			}),
		);
		const code = await main(["init", "--app-id", "42"], {
			stdout,
			stderr,
			stdin,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(0);
		expect(out.join("") + err.join("")).not.toContain("is not in this project");
	});

	it("prompts for the appId on a TTY, shows the file, writes on confirm", async () => {
		const input = new PassThrough();
		const pending = main(["init"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			input,
			env: env(),
			cwd: root,
		});
		// appId answer, then the write confirm (Enter = Y), then the login
		// offer (declined). readline eagerly consumes pre-buffered lines, so
		// later answers must arrive only after their questions exist.
		input.write("42\n");
		setTimeout(() => input.write("\n"), 30);
		setTimeout(() => input.write("n\n"), 60);
		const code = await pending;
		expect(code).toBe(0);
		const config = await readConfig();
		expect(config).toContain("appId: 42,");
		expect(out.join("")).toContain("Write vkma-deploy.config.ts?");
		expect(out.join("")).toContain("Next: npx vkma-deploy login");
	});

	it("re-asks a garbage appId until it parses", async () => {
		const input = new PassThrough();
		const pending = main(["init"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			input,
			env: env(),
			cwd: root,
		});
		input.write("nope\n");
		setTimeout(() => input.write("42\n"), 30);
		setTimeout(() => input.write("\n"), 60);
		setTimeout(() => input.write("n\n"), 90);
		const code = await pending;
		expect(code).toBe(0);
		expect(await readConfig()).toContain("appId: 42,");
	});

	it("declining the write confirm aborts with 130 and writes nothing", async () => {
		const input = new PassThrough();
		const pending = main(["init"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			input,
			env: env(),
			cwd: root,
		});
		input.write("42\n");
		setTimeout(() => input.write("n\n"), 30);
		const code = await pending;
		expect(code).toBe(130);
		await expect(readConfig()).rejects.toThrow();
	});

	it("--yes skips both confirms on a TTY", async () => {
		const input = new PassThrough();
		const code = await main(["init", "--app-id", "42", "--yes"], {
			stdout,
			stderr,
			stdin: { isTTY: true },
			input,
			env: env(),
			cwd: root,
		});
		expect(code).toBe(0);
		const config = await readConfig();
		expect(config).toContain("appId: 42,");
		const text = out.join("");
		expect(text).not.toContain("Write vkma-deploy.config.ts?");
		expect(text).not.toContain("Authorize now");
		expect(text).toContain("Next: npx vkma-deploy login");
	});

	it("chains into login on accept and stores the token", async () => {
		// The generated config imports "@vkma.dev/deploy"; a real project
		// resolves it from node_modules, so the test project gets a stub.
		const stubDir = path.join(root, "node_modules", "@vkma.dev", "deploy");
		await fs.mkdir(stubDir, { recursive: true });
		await fs.writeFile(
			path.join(stubDir, "package.json"),
			JSON.stringify({ name: "@vkma.dev/deploy", type: "module", main: "index.js" }),
		);
		await fs.writeFile(
			path.join(stubDir, "index.js"),
			"export const defineDeployConfig = (config) => config;\n",
		);
		const spy = createFetchSpy(
			route([
				["get_auth_code", () => ({ body: { auth_code: "A", device_id: "D" } })],
				[
					"code_auth_token",
					() => ({ body: { access_token: "chained-secret-token", expires_in: 100 } }),
				],
			]),
		);
		const input = new PassThrough();
		const pending = main(["init", "--app-id", "42"], {
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
		input.write("\n");
		setTimeout(() => input.write("y\n"), 30);
		const code = await pending;
		expect(code).toBe(0);
		expect(out.join("")).toContain("Token saved");
		const stored = JSON.parse(
			await fs.readFile(
				path.join(root, "home", ".config", "vkma", "deploy", "credentials.json"),
				"utf8",
			),
		) as { accessToken: string };
		expect(stored.accessToken).toBe("chained-secret-token");
	});

	it("help mentions init", async () => {
		const code = await main(["--help"], { stdout, stderr, stdin, env: env(), cwd: root });
		expect(code).toBe(0);
		expect(out.join("")).toContain("vkma-deploy init");
		expect(out.join("")).toContain("--app-id");
	});
});
