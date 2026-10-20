import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeployError } from "./errors.ts";
import { makeTempDir } from "./test-utils.ts";
import { zipDirectory } from "./zip.ts";

let dir: string;

beforeEach(async () => {
	dir = await makeTempDir("vkma-zip-");
});

afterEach(async () => {
	await fs.rm(dir, { recursive: true, force: true });
});

describe("zipDirectory", () => {
	it("zips nested files, spaces in names, and records empty dirs", async () => {
		await fs.mkdir(path.join(dir, "assets"), { recursive: true });
		await fs.mkdir(path.join(dir, "empty"));
		await fs.writeFile(path.join(dir, "index.html"), "<html>hi</html>");
		await fs.writeFile(path.join(dir, "assets", "main.js"), "console.log(1)");
		await fs.writeFile(path.join(dir, "my file.txt"), "with spaces"); // upstream issue #119

		const entries: string[] = [];
		const result = await zipDirectory(dir, { onEntry: p => entries.push(p) });
		expect(result.files).toBe(3);
		expect(result.bytes).toBe(
			Buffer.from("<html>hi</html>").length +
				Buffer.from("console.log(1)").length +
				"with spaces".length,
		);

		const unzipped = unzipSync(result.archive);
		expect(Object.keys(unzipped).toSorted()).toEqual([
			"assets/",
			"assets/main.js",
			"empty/",
			"index.html",
			"my file.txt",
		]);
		const decoder = new TextDecoder();
		expect(decoder.decode(unzipped["index.html"] ?? new Uint8Array(0))).toBe("<html>hi</html>");
		expect(decoder.decode(unzipped["my file.txt"] ?? new Uint8Array(0))).toBe("with spaces");
		expect(entries.toSorted()).toEqual(["assets/main.js", "index.html", "my file.txt"]);
	});

	it("follows symlinked files but skips symlinked directories", async () => {
		const outside = path.join(path.dirname(dir), "outside-secret.txt");
		await fs.writeFile(outside, "outside");
		await fs.symlink(outside, path.join(dir, "linked.txt"));

		const nestedOutside = await makeTempDir("vkma-zipdir-");
		await fs.writeFile(path.join(nestedOutside, "x.txt"), "x");
		await fs.symlink(nestedOutside, path.join(dir, "linked-dir"));

		const result = await zipDirectory(dir);
		const unzipped = unzipSync(result.archive);
		expect(Object.keys(unzipped)).toContain("linked.txt");
		expect(Object.keys(unzipped).some(key => key.startsWith("linked-dir"))).toBe(false);

		await fs.rm(nestedOutside, { recursive: true, force: true });
		await fs.rm(outside, { force: true });
	});

	it("fails on an empty directory instead of uploading an empty bundle", async () => {
		const empty = path.join(dir, "nothing");
		await fs.mkdir(empty);
		await expect(zipDirectory(empty)).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).code === "E_EMPTY_BUNDLE",
		);
	});

	it("fails clearly when the directory does not exist", async () => {
		await expect(zipDirectory(path.join(dir, "missing"))).rejects.toSatisfy(
			(error: unknown) => error instanceof DeployError && error.kind === "config",
		);
	});
});
