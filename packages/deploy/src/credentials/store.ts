/**
 * Credential storage.
 *
 * Tokens live in `$XDG_CONFIG_HOME/vkma/deploy/credentials.json` (0600).
 * For drop-in migration the store also reads the upstream configstore vault
 * (`~/.config/configstore/@vkontakte/vk-miniapps-deploy.json`) as a fallback,
 * read-only — after `vkma-deploy login` everything is written to our file.
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface StoredCredentials {
	readonly accessToken: string;
	/** Epoch ms when the token expires, if known. */
	readonly expiresAt?: number;
	readonly savedAt: number;
}

export interface LoadedCredentials {
	readonly accessToken: string;
	readonly expiresAt?: number;
	/** Where the token came from. */
	readonly source: "vkma" | "upstream-configstore";
}

const UPSTREAM_VAULT_RELATIVE = ["configstore", "@vkontakte", "vk-miniapps-deploy.json"];

function configRoot(env: Record<string, string | undefined>): string {
	const xdg = env["XDG_CONFIG_HOME"];
	if (xdg !== undefined && xdg.trim() !== "") {
		return xdg;
	}
	// XDG spec: fall back to $HOME/.config. Respect the passed env (keeps the
	// function testable); os.homedir() is only a last resort.
	const home = env["HOME"];
	return path.join(home !== undefined && home.trim() !== "" ? home : os.homedir(), ".config");
}

export function credentialsPath(env: Record<string, string | undefined>): string {
	return path.join(configRoot(env), "vkma", "deploy", "credentials.json");
}

function upstreamVaultPath(env: Record<string, string | undefined>): string {
	return path.join(configRoot(env), ...UPSTREAM_VAULT_RELATIVE);
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | undefined> {
	try {
		const text = await fs.readFile(filePath, "utf8");
		const parsed: unknown = JSON.parse(text);
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

/**
 * Loads credentials: our file first, then the upstream vault. Expired
 * tokens (when the expiry is known) fall through to the upstream vault —
 * a stale vkma token must not shadow a still-working upstream one.
 */
export async function loadCredentials(
	env: Record<string, string | undefined> = process.env,
): Promise<LoadedCredentials | undefined> {
	const ours = await readJsonFile(credentialsPath(env));
	const token = ours?.["accessToken"];
	if (typeof token === "string" && token.length > 0) {
		const expiresAt = typeof ours?.["expiresAt"] === "number" ? ours["expiresAt"] : undefined;
		if (expiresAt === undefined || expiresAt > Date.now()) {
			return { accessToken: token, expiresAt, source: "vkma" };
		}
		// Expired: keep looking instead of reporting "no token at all".
	}

	const upstream = await readJsonFile(upstreamVaultPath(env));
	const upstreamToken = upstream?.["access_token"];
	if (typeof upstreamToken === "string" && upstreamToken.length > 0) {
		// Upstream stores a raw `expires_in` with ambiguous semantics; ignore it.
		return { accessToken: upstreamToken, source: "upstream-configstore" };
	}

	return undefined;
}

/** Saves credentials with restrictive permissions. Returns the file path. */
export async function saveCredentials(
	credentials: { accessToken: string; expiresIn?: number },
	env: Record<string, string | undefined> = process.env,
): Promise<string> {
	const filePath = credentialsPath(env);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const payload: StoredCredentials = {
		accessToken: credentials.accessToken,
		expiresAt:
			credentials.expiresIn !== undefined && credentials.expiresIn > 0
				? Date.now() + credentials.expiresIn * 1000
				: undefined,
		savedAt: Date.now(),
	};
	// Atomic write: a crash mid-save must never leave a torn (empty or
	// partial) credentials file behind — write a 0600 temp sibling and
	// rename over the target.
	const tempPath = `${filePath}.tmp-${randomBytes(6).toString("hex")}`;
	await fs.writeFile(tempPath, `${JSON.stringify(payload, null, "\t")}\n`, { mode: 0o600 });
	try {
		await fs.rename(tempPath, filePath);
	} catch (error) {
		await fs.rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}
	// mkdir/writeFile mode is best-effort on some platforms; enforce explicitly.
	await fs.chmod(filePath, 0o600).catch(() => undefined);
	return filePath;
}

/** Removes our credentials file. Returns true when something was deleted. */
export async function clearCredentials(
	env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
	try {
		await fs.unlink(credentialsPath(env));
		return true;
	} catch {
		return false;
	}
}
