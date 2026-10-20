import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../test-utils.ts";
import { credentialsPath, clearCredentials, loadCredentials, saveCredentials } from "./store.ts";

let home: string;
let env: Record<string, string | undefined>;

beforeEach(async () => {
	home = await makeTempDir("vkma-creds-");
	env = { XDG_CONFIG_HOME: path.join(home, ".config"), HOME: home, PATH: process.env["PATH"] };
});

afterEach(async () => {
	await fs.rm(home, { recursive: true, force: true });
});

describe("credentials store", () => {
	it("uses the XDG path and respects XDG_CONFIG_HOME", () => {
		expect(credentialsPath(env)).toBe(
			path.join(home, ".config", "vkma", "deploy", "credentials.json"),
		);
		expect(credentialsPath({ ...env, XDG_CONFIG_HOME: undefined })).toBe(
			path.join(home, ".config", "vkma", "deploy", "credentials.json"),
		);
	});

	it("round-trips credentials with 0600 permissions", async () => {
		const filePath = await saveCredentials(
			{ accessToken: "tok-abcdef123456", expiresIn: 3600 },
			env,
		);
		expect(filePath).toBe(credentialsPath(env));

		const stats = await fs.stat(filePath);
		expect(stats.mode & 0o777).toBe(0o600);

		const loaded = await loadCredentials(env);
		expect(loaded?.accessToken).toBe("tok-abcdef123456");
		expect(loaded?.source).toBe("vkma");
		expect(loaded?.expiresAt).toBeGreaterThan(Date.now());
	});

	it("treats expired tokens as missing (fixes upstream epoch confusion)", async () => {
		const filePath = credentialsPath(env);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(
			filePath,
			JSON.stringify({ accessToken: "expired", expiresAt: Date.now() - 1000, savedAt: 0 }),
			"utf8",
		);
		expect(await loadCredentials(env)).toBeUndefined();
	});

	it("falls back to the upstream configstore vault read-only", async () => {
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
			JSON.stringify({ access_token: "upstream-token", expires_in: 0 }),
			"utf8",
		);
		const loaded = await loadCredentials(env);
		expect(loaded).toEqual({ accessToken: "upstream-token", source: "upstream-configstore" });
	});

	it("prefers our vault over the upstream one", async () => {
		await saveCredentials({ accessToken: "ours" }, env);
		const vault = path.join(
			home,
			".config",
			"configstore",
			"@vkontakte",
			"vk-miniapps-deploy.json",
		);
		await fs.mkdir(path.dirname(vault), { recursive: true });
		await fs.writeFile(vault, JSON.stringify({ access_token: "theirs" }), "utf8");
		expect((await loadCredentials(env))?.accessToken).toBe("ours");
	});

	it("clearCredentials removes only our file", async () => {
		await saveCredentials({ accessToken: "ours" }, env);
		expect(await clearCredentials(env)).toBe(true);
		expect(await loadCredentials(env)).toBeUndefined();
		expect(await clearCredentials(env)).toBe(false);
	});

	it("ignores malformed files", async () => {
		const filePath = credentialsPath(env);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, "not json at all", "utf8");
		expect(await loadCredentials(env)).toBeUndefined();
	});
});
