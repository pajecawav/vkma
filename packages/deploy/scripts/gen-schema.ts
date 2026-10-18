/**
 * Regenerates schema/vkma-deploy.config.schema.json from the TypeBox source.
 * Run: pnpm schema (after changing src/config/schema.ts).
 * A test asserts the committed file matches, so the schema can never drift.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { deployConfigJsonSchema } from "../src/config/schema.ts";

const outPath = path.join(import.meta.dirname, "..", "schema", "vkma-deploy.config.schema.json");
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(deployConfigJsonSchema(), null, "\t")}\n`, "utf8");
console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
