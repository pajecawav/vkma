/**
 * Regenerates schema/vkma-tunnel.config.schema.json from the TypeBox source.
 * Run: pnpm schema (after changing src/config/schema.ts).
 * A test asserts the committed file matches, so the schema can never drift.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { tunnelConfigJsonSchema } from "../src/config/schema.ts";

const outPath = path.join(import.meta.dirname, "..", "schema", "vkma-tunnel.config.schema.json");
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(tunnelConfigJsonSchema(), null, "\t")}\n`, "utf8");
console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
