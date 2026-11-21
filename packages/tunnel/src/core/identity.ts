/**
 * Identity store: one JSON record per profile under a shared data dir.
 *
 * `XDG_DATA_HOME/vkma/tunnel/<profile>.json` (0600, atomic writes) holds
 * the provider identity (opentunnel token/keys — provider-specific fields
 * live beside the shared ones) plus the metadata the CLI surfaces:
 *
 * - `hostname`   — the public hostname (stable URL = `<route>.<hostname>`)
 * - `lastTarget` — last `host:port` this profile forwarded to
 * - `createdAt` / `updatedAt` — bookkeeping for `list`
 *
 * The opentunnel provider plugs into this same file through its
 * `OpenTunnelStorage` adapter (providers/opentunnel.ts); the functions
 * here are the provider-neutral read/remove surface the CLI uses.
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Fields every provider record must keep for the shared CLI surface. */
export interface ProfileRecord {
	readonly profile: string;
	readonly hostname: string;
	readonly lastTarget?: string;
	/** Route name of the last run (`"@"` when unknown) — builds list/status URLs. */
	readonly lastRoute?: string;
	/** Process id of the last attach — route-conflict hints point here. */
	readonly pid?: number;
	/** ISO time of that attach. */
	readonly startedAt?: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
}

function dataRoot(env: Record<string, string | undefined>): string {
	const xdg = env["XDG_DATA_HOME"];
	if (xdg !== undefined && xdg.trim() !== "") {
		return xdg;
	}
	// XDG spec: fall back to $HOME/.local/share. Respect the passed env
	// (keeps the function testable); os.homedir() is only a last resort.
	const home = env["HOME"];
	return path.join(
		home !== undefined && home.trim() !== "" ? home : os.homedir(),
		".local",
		"share",
	);
}

/** Resolves the identity-store root (`dataDir` option overrides it). */
export function tunnelDataDir(
	env: Record<string, string | undefined> = process.env,
	override?: string,
): string {
	return override !== undefined ? override : path.join(dataRoot(env), "vkma", "tunnel");
}

export function profileFilePath(dataDir: string, profile: string): string {
	return path.join(dataDir, `${profile}.json`);
}

/** Reads one profile record, or undefined when the profile has no identity. */
export async function readProfileRecord(
	dataDir: string,
	profile: string,
): Promise<ProfileRecord | undefined> {
	const raw = await readRecordFile(profileFilePath(dataDir, profile));
	return raw === undefined ? undefined : { ...raw, profile };
}

/** Lists every stored profile record (unparseable files are skipped). */
export async function listProfileRecords(dataDir: string): Promise<ProfileRecord[]> {
	let entries: readonly string[];
	try {
		entries = await fs.readdir(dataDir);
	} catch {
		return [];
	}
	const records: ProfileRecord[] = [];
	for (const entry of entries) {
		if (!entry.endsWith(".json")) {
			continue;
		}
		const profile = entry.slice(0, -".json".length);
		const raw = await readRecordFile(path.join(dataDir, entry));
		if (raw !== undefined) {
			records.push({ ...raw, profile });
		}
	}
	return records.toSorted((a, b) => a.profile.localeCompare(b.profile));
}

/** Deletes one profile record. Returns true when something was deleted. */
export async function removeProfileRecord(dataDir: string, profile: string): Promise<boolean> {
	try {
		await fs.unlink(profileFilePath(dataDir, profile));
		return true;
	} catch {
		return false;
	}
}

/** Deletes every profile record. Returns the removed profile names. */
export async function removeAllProfileRecords(dataDir: string): Promise<string[]> {
	const records = await listProfileRecords(dataDir);
	for (const record of records) {
		await removeProfileRecord(dataDir, record.profile);
	}
	return records.map(record => record.profile);
}

/**
 * Reads a record file and projects the shared fields. Provider-specific
 * fields (token, keys, pending provisioning) are intentionally ignored
 * here — only the opentunnel storage adapter touches them.
 */
async function readRecordFile(
	filePath: string,
): Promise<Omit<ProfileRecord, "profile"> | undefined> {
	let text: string;
	try {
		text = await fs.readFile(filePath, "utf8");
	} catch {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return undefined;
	}
	const record = parsed as Record<string, unknown>;
	const hostname = record["hostname"];
	if (typeof hostname !== "string" || hostname === "") {
		return undefined;
	}
	return {
		hostname,
		lastTarget: typeof record["lastTarget"] === "string" ? record["lastTarget"] : undefined,
		lastRoute: typeof record["lastRoute"] === "string" ? record["lastRoute"] : undefined,
		pid: typeof record["pid"] === "number" ? record["pid"] : undefined,
		startedAt: typeof record["startedAt"] === "string" ? record["startedAt"] : undefined,
		createdAt: typeof record["createdAt"] === "string" ? record["createdAt"] : undefined,
		updatedAt: typeof record["updatedAt"] === "string" ? record["updatedAt"] : undefined,
	};
}

/**
 * Merges fields into an existing record file (creating it when missing),
 * preserving unknown fields — the provider identity stays intact while
 * shared metadata is stamped around it. Atomic write, 0600.
 */
export async function mergeRecordFile(
	dataDir: string,
	profile: string,
	patch: Record<string, unknown>,
): Promise<void> {
	const filePath = profileFilePath(dataDir, profile);
	let current: Record<string, unknown> = {};
	try {
		const text = await fs.readFile(filePath, "utf8");
		const parsed: unknown = JSON.parse(text);
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
			current = parsed as Record<string, unknown>;
		}
	} catch {
		// Missing or torn file: start fresh.
	}
	const next = { ...current, ...patch };
	await fs.mkdir(dataDir, { recursive: true });
	// Atomic write: a crash mid-save must never leave a torn identity file.
	const tempPath = `${filePath}.tmp-${randomBytes(6).toString("hex")}`;
	await fs.writeFile(tempPath, `${JSON.stringify(next, null, "\t")}\n`, { mode: 0o600 });
	try {
		await fs.rename(tempPath, filePath);
	} catch (error) {
		await fs.rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}
	// mkdir/writeFile mode is best-effort on some platforms; enforce explicitly.
	await fs.chmod(filePath, 0o600).catch(() => undefined);
}
