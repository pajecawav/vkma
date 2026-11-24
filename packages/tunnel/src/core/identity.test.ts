import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	listProfileRecords,
	mergeRecordFile,
	profileFilePath,
	readProfileRecord,
	listRecordProfiles,
	removeAllProfileRecords,
	removeProfileRecord,
	tunnelDataDir,
} from "./identity.ts";

let dataDir: string;

beforeAll(async () => {
	dataDir = await fs.mkdtemp(path.join(import.meta.dirname, ".identity-test-"));
});

afterAll(async () => {
	await fs.rm(dataDir, { recursive: true, force: true });
});

describe("tunnelDataDir", () => {
	it("resolves XDG_DATA_HOME", () => {
		expect(tunnelDataDir({ XDG_DATA_HOME: "/xdg" })).toBe(path.join("/xdg", "vkma", "tunnel"));
	});

	it("falls back to $HOME/.local/share", () => {
		expect(tunnelDataDir({ HOME: "/home/u" })).toBe(
			path.join("/home/u", ".local", "share", "vkma", "tunnel"),
		);
	});

	it("prefers the explicit override", () => {
		expect(tunnelDataDir({ XDG_DATA_HOME: "/xdg" }, "/tmp/custom")).toBe("/tmp/custom");
	});
});

describe("record files", () => {
	it("merge creates and preserves fields across merges", async () => {
		await mergeRecordFile(dataDir, "app", {
			hostname: "abc.opentunnel.xyz",
			createdAt: "2026-01-01T00:00:00.000Z",
		});
		await mergeRecordFile(dataDir, "app", { lastTarget: "127.0.0.1:5173", lastRoute: "app" });

		const record = await readProfileRecord(dataDir, "app");
		expect(record).toEqual({
			profile: "app",
			hostname: "abc.opentunnel.xyz",
			lastTarget: "127.0.0.1:5173",
			lastRoute: "app",
			createdAt: "2026-01-01T00:00:00.000Z",
		});
	});

	it("writes records with 0600 permissions", async () => {
		const stats = await fs.stat(profileFilePath(dataDir, "app"));
		expect(stats.mode & 0o777).toBe(0o600);
	});

	it("reads undefined for unknown profiles", async () => {
		expect(await readProfileRecord(dataDir, "missing")).toBeUndefined();
	});

	it("skips records without a hostname", async () => {
		await mergeRecordFile(dataDir, "broken", { lastTarget: "127.0.0.1:1" });
		expect(await readProfileRecord(dataDir, "broken")).toBeUndefined();
	});

	it("lists records sorted by profile", async () => {
		await mergeRecordFile(dataDir, "zeta", { hostname: "z.opentunnel.xyz" });
		await mergeRecordFile(dataDir, "alpha", { hostname: "a.opentunnel.xyz" });
		const records = await listProfileRecords(dataDir);
		const names = records.map(record => record.profile);
		expect(names).toContain("alpha");
		expect(names).toContain("zeta");
		expect(names.indexOf("alpha")).toBeLessThan(names.indexOf("zeta"));
	});

	it("removes a single profile and everything", async () => {
		expect(await removeProfileRecord(dataDir, "zeta")).toBe(true);
		expect(await removeProfileRecord(dataDir, "zeta")).toBe(false);
		const removed = await removeAllProfileRecords(dataDir);
		expect(removed.length).toBeGreaterThan(0);
		expect(await listProfileRecords(dataDir)).toEqual([]);
	});

	it("--all removal also drops the records `list` cannot show", async () => {
		// A first run that never minted a hostname leaves exactly this.
		await mergeRecordFile(dataDir, "half", {
			provider: "opentunnel",
			lastTarget: "127.0.0.1:1",
		});
		expect(await listProfileRecords(dataDir)).toEqual([]);
		expect(await listRecordProfiles(dataDir)).toEqual(["half"]);

		expect(await removeAllProfileRecords(dataDir)).toEqual(["half"]);
		expect(await listRecordProfiles(dataDir)).toEqual([]);
		expect(await fs.readdir(dataDir)).toEqual([]);
	});

	it("returns [] for a missing directory", async () => {
		expect(await listProfileRecords(path.join(dataDir, "nope"))).toEqual([]);
	});
});
