import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listProfileRecords } from "../core/identity.ts";
import { createRecordStorage } from "./opentunnel.ts";

let dataDir: string;

beforeAll(async () => {
	dataDir = await fs.mkdtemp(path.join(import.meta.dirname, ".storage-test-"));
});

afterAll(async () => {
	await fs.rm(dataDir, { recursive: true, force: true });
});

const IDENTITY = {
	id: "abc123def456",
	hostname: "abc123def456.opentunnel.xyz",
	token: "token-1",
	privateKey: "-----BEGIN…",
	certificate: "-----CERT…",
	chain: "-----CHAIN…",
	certificateExpiry: new Date("2027-01-01T00:00:00.000Z"),
};

describe("createRecordStorage", () => {
	it("round-trips an identity, reviving the expiry Date", async () => {
		const storage = createRecordStorage(dataDir);
		await storage.save("app", IDENTITY);
		const loaded = await storage.load("app");
		expect(loaded).toBeDefined();
		expect(loaded?.hostname).toBe(IDENTITY.hostname);
		expect(loaded?.certificateExpiry).toBeInstanceOf(Date);
		expect(loaded?.certificateExpiry.toISOString()).toBe(
			IDENTITY.certificateExpiry.toISOString(),
		);
	});

	it("preserves shared metadata through identity saves", async () => {
		const storage = createRecordStorage(dataDir);
		await storage.save("app", IDENTITY);
		const before = await listProfileRecords(dataDir);
		expect(before[0]?.lastTarget).toBeUndefined();
		// A metadata stamp (connect start) then a certificate renewal:
		await storage.save("app", { ...IDENTITY, token: "token-2" });
		const records = await listProfileRecords(dataDir);
		expect(records[0]?.hostname).toBe(IDENTITY.hostname);
		expect(records[0]?.createdAt).toBeDefined();
	});

	it("round-trips pending provisioning state", async () => {
		const storage = createRecordStorage(dataDir);
		await storage.savePending("pending-app", {
			id: "p1",
			hostname: "p1.opentunnel.xyz",
			token: "t",
			privateKey: "k",
			csr: "csr",
		});
		const pending = await storage.loadPending("pending-app");
		expect(pending?.hostname).toBe("p1.opentunnel.xyz");
	});

	it("lists profiles and stored tunnels", async () => {
		const storage = createRecordStorage(dataDir);
		const profiles = await storage.profiles();
		expect(profiles).toContain("app");
		const tunnels = await storage.list();
		expect(tunnels.map(entry => entry.profile)).toContain("app");
	});

	it("remove deletes the record", async () => {
		const storage = createRecordStorage(dataDir);
		await storage.remove("pending-app");
		expect(await storage.load("pending-app")).toBeUndefined();
		const record = await fs
			.readFile(path.join(dataDir, "pending-app.json"), "utf8")
			.catch(() => undefined);
		expect(record).toBeUndefined();
	});
});
