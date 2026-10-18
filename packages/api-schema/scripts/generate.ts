/**
 * Generates `src/generated` from the VK API schema submodule:
 *
 * 1. Transform the per-section `methods` / `objects` / `responses` JSON files
 *    (VK dialect → plain JSON Schema `definitions`) into `.schema-transformed/`.
 * 2. Run json2code: `typescript` target as-is, `zod` + `valibot` targets with
 *    an `exportSuffix: "Schema"`.
 * 3. Emit `version.ts` (API_VERSION), `enum-names.ts` (…EnumNames constants)
 *    and per-target `index.ts` barrels with explicit named re-exports.
 *
 * Run via `pnpm generate` from the package root.
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "@pajecawav/json2code";
import { buildBarrel, renderEnumNamesModule, renderVersionModule } from "./lib/emit.ts";
import { pascal } from "./lib/naming.ts";
import {
	collectEnumNames,
	transformMethodsDoc,
	transformResponsesDoc,
	type EnumNamesEntry,
	type VkSchemaDocument,
} from "./lib/transform.ts";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(pkgRoot, "schema");
const tmpDir = path.join(pkgRoot, ".schema-transformed");
const outDir = path.join(pkgRoot, "src", "generated");

const STEMS = ["methods", "objects", "responses"] as const;
type Stem = (typeof STEMS)[number];

async function main(): Promise<void> {
	let apiVersion: string | undefined;
	const enumEntries = new Map<string, EnumNamesEntry>();
	let transformedFiles = 0;

	await rm(tmpDir, { recursive: true, force: true });
	await rm(outDir, { recursive: true, force: true });
	await mkdir(tmpDir, { recursive: true });

	const sections = (await readdir(schemaDir, { withFileTypes: true }))
		.filter(entry => entry.isDirectory())
		.map(entry => entry.name)
		.sort((a, b) => a.localeCompare(b));

	for (const section of sections) {
		for (const stem of STEMS) {
			const raw = await readJson<VkSchemaDocument>(section, stem);
			if (raw === undefined) {
				continue;
			}
			let doc: VkSchemaDocument;
			if (stem === "methods") {
				const result = transformMethodsDoc(raw);
				doc = result.doc;
				apiVersion ??= result.version;
			} else if (stem === "responses") {
				doc = transformResponsesDoc(raw);
			} else {
				doc = raw;
			}
			const definitions = (doc.definitions ?? {}) as Record<string, unknown>;
			for (const [defName, def] of Object.entries(definitions)) {
				const entry = collectEnumNames(defName, def);
				if (entry) {
					enumEntries.set(defName, entry);
				}
			}
			const file = path.join(tmpDir, section, `${stem}.json`);
			await mkdir(path.dirname(file), { recursive: true });
			await writeFile(file, `${JSON.stringify(doc, null, "\t")}\n`);
			transformedFiles++;
		}
	}

	if (!apiVersion) {
		throw new Error("VK API schema: no `version` field found in any methods.json");
	}

	await generate({
		input: tmpDir,
		output: outDir,
		targets: ["typescript"],
	});
	await generate({
		input: tmpDir,
		output: outDir,
		targets: ["zod", "valibot"],
		options: { exportSuffix: "Schema" },
	});

	const entries = [...enumEntries.values()].sort((a, b) => a.defName.localeCompare(b.defName));
	await writeFile(path.join(outDir, "typescript", "version.ts"), renderVersionModule(apiVersion));
	await writeFile(
		path.join(outDir, "typescript", "enum-names.ts"),
		renderEnumNamesModule(entries),
	);
	const enumNamesExports = entries.map(entry => `${pascal(entry.defName)}EnumNames`);
	await writeFile(
		path.join(outDir, "typescript", "index.ts"),
		await buildBarrel(
			path.join(outDir, "typescript"),
			"",
			{ version: true, enumNames: enumNamesExports },
			true,
		),
	);
	await writeFile(
		path.join(outDir, "zod", "index.ts"),
		await buildBarrel(
			path.join(outDir, "zod"),
			"Schema",
			{ version: false, enumNames: [] },
			false,
		),
	);
	await writeFile(
		path.join(outDir, "valibot", "index.ts"),
		await buildBarrel(
			path.join(outDir, "valibot"),
			"Schema",
			{ version: false, enumNames: [] },
			false,
		),
	);

	const summary = [
		`sections: ${sections.length}`,
		`transformed docs: ${transformedFiles}`,
		`EnumNames constants: ${entries.length}`,
		`API_VERSION: ${apiVersion}`,
	];
	console.log(`api-schema: ${summary.join(", ")}`);
}

async function readJson<T>(section: string, stem: Stem): Promise<T | undefined> {
	try {
		const content = await readFile(path.join(schemaDir, section, `${stem}.json`), "utf8");
		return JSON.parse(content) as T;
	} catch {
		return undefined;
	}
}

await main();
