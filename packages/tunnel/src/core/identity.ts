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
	/**
	 * The provider this profile belongs to. Absent in records written
	 * before the second provider existed: those are opentunnel's.
	 */
	readonly provider?: string;
	readonly lastTarget?: string;
	/** Route name of the last run (`"@"` when unknown) — builds list/status URLs. */
	readonly lastRoute?: string;
	/**
	 * Process id of the last SUCCESSFUL attach — route-conflict hints point
	 * here. Written after the first attach, never at start, so a newcomer
	 * fighting for the route still finds the incumbent's pid.
	 */
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
	const raw = await readRawRecord(profileFilePath(dataDir, profile));
	return raw === undefined ? undefined : projectRecord(raw, profile);
}

/** What a profile's record file holds — and who wrote it. */
export interface ProfileRecordFile {
	/**
	 * The shared fields, when the record has a public hostname: what
	 * `list` and `status` show. Undefined for a record without one — an
	 * identity in the making — and when there is no record file.
	 */
	readonly record?: ProfileRecord;
	/**
	 * The provider that owns the file, hostname or not. Undefined when
	 * there is no record file at all.
	 */
	readonly owner?: string;
}

/**
 * Reads a profile's record file whole: the shared fields that need a
 * hostname (see `readProfileRecord`) and, besides them, the provider the
 * file belongs to.
 *
 * The owner is read from the file, not from the hostname. An identity in
 * the making has none yet: the opentunnel SDK stores a `pending` record
 * before the certificate is issued, and a first run interrupted during
 * that wait leaves exactly that. Read through the hostname, such a record
 * was invisible, and a cloudflared token run took the profile over.
 *
 * A file without a `provider` field predates the second provider; who
 * wrote those is the caller's to say (`legacyProvider`).
 */
export async function readProfileRecordFile(
	dataDir: string,
	profile: string,
	legacyProvider: string,
): Promise<ProfileRecordFile> {
	const raw = await readRawRecord(profileFilePath(dataDir, profile));
	if (raw === undefined) {
		return {};
	}
	const record = projectRecord(raw, profile);
	const owner = typeof raw["provider"] === "string" ? raw["provider"] : legacyProvider;
	return { ...(record === undefined ? {} : { record }), owner };
}

/**
 * Removes a record file that holds nothing but `stamp` — what the core
 * wrote before a connect that then failed. The run could not even
 * connect, so it owns no profile. A provider may have put something of
 * its own into the file meanwhile (an opentunnel identity in the making);
 * then the file stays, stamp and all. Returns true when the file is gone.
 */
export async function removeRecordIfUntouched(
	dataDir: string,
	profile: string,
	stamp: Record<string, unknown>,
): Promise<boolean> {
	const raw = await readRawRecord(profileFilePath(dataDir, profile));
	if (raw === undefined) {
		return false;
	}
	const untouched = Object.keys(raw).every(key => key in stamp && raw[key] === stamp[key]);
	return untouched ? removeProfileRecord(dataDir, profile) : false;
}

/**
 * Every profile that has a record file — with a hostname or without one
 * (a first run that never minted it). `listProfileRecords` shows only the
 * former; removal has to see both or `reset --all` leaves files behind
 * while reporting an empty store.
 */
export async function listRecordProfiles(dataDir: string): Promise<string[]> {
	let entries: readonly string[];
	try {
		entries = await fs.readdir(dataDir);
	} catch {
		return [];
	}
	return entries
		.filter(entry => entry.endsWith(".json"))
		.map(entry => entry.slice(0, -".json".length))
		.toSorted((left, right) => left.localeCompare(right));
}

/**
 * Lists the stored profile records that have a hostname, sorted by profile
 * (files that are unparseable or hold no hostname yet are skipped — see
 * `listRecordProfiles` for those).
 */
export async function listProfileRecords(dataDir: string): Promise<ProfileRecord[]> {
	const records: ProfileRecord[] = [];
	for (const profile of await listRecordProfiles(dataDir)) {
		const raw = await readRawRecord(profileFilePath(dataDir, profile));
		if (raw !== undefined) {
			const record = projectRecord(raw, profile);
			if (record !== undefined) {
				records.push(record);
			}
		}
	}
	return records;
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

/**
 * Deletes every profile record file, with a hostname or without. Returns the
 * removed profile names.
 */
export async function removeAllProfileRecords(dataDir: string): Promise<string[]> {
	const removed: string[] = [];
	for (const profile of await listRecordProfiles(dataDir)) {
		if (await removeProfileRecord(dataDir, profile)) {
			removed.push(profile);
		}
	}
	return removed;
}

/**
 * A record file as written, every field included — the provider identity
 * (`token`, `privateKey`, `pending` provisioning state) beside the shared
 * ones. Undefined when the file is missing, torn or not an object.
 */
async function readRawRecord(filePath: string): Promise<Record<string, unknown> | undefined> {
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
	return parsed as Record<string, unknown>;
}

/**
 * Projects the shared fields out of a record file. Provider-specific
 * fields are intentionally ignored here — only the opentunnel storage
 * adapter touches them. Undefined when the record has no hostname yet.
 */
function projectRecord(
	record: Record<string, unknown>,
	profile: string,
): ProfileRecord | undefined {
	const hostname = record["hostname"];
	if (typeof hostname !== "string" || hostname === "") {
		return undefined;
	}
	return {
		hostname,
		provider: typeof record["provider"] === "string" ? record["provider"] : undefined,
		lastTarget: typeof record["lastTarget"] === "string" ? record["lastTarget"] : undefined,
		lastRoute: typeof record["lastRoute"] === "string" ? record["lastRoute"] : undefined,
		pid: typeof record["pid"] === "number" ? record["pid"] : undefined,
		startedAt: typeof record["startedAt"] === "string" ? record["startedAt"] : undefined,
		createdAt: typeof record["createdAt"] === "string" ? record["createdAt"] : undefined,
		updatedAt: typeof record["updatedAt"] === "string" ? record["updatedAt"] : undefined,
		profile,
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
