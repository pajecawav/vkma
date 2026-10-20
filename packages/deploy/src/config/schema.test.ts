import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defineDeployConfig } from "./define.ts";
import { deployConfigJsonSchema } from "./schema.ts";

describe("shipped JSON schema", () => {
	it("matches the TypeBox source (no drift)", () => {
		const filePath = path.join(
			import.meta.dirname,
			"..",
			"..",
			"schema",
			"vkma-deploy.config.schema.json",
		);
		const committed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
		expect(committed).toEqual(deployConfigJsonSchema());
	});

	it("is a valid JSON Schema document with an $id", () => {
		const schema = deployConfigJsonSchema();
		expect(schema["$schema"]).toContain("json-schema.org");
		expect(typeof schema["$id"]).toBe("string");
		expect(schema["type"]).toBe("object");
		const properties = schema["properties"] as Record<string, unknown>;
		for (const field of [
			"appId",
			"staticPath",
			"endpoints",
			"environment",
			"updateProd",
			"accessToken",
		]) {
			expect(properties[field]).toBeDefined();
		}
	});

	it("rejects unknown properties and whitelists $schema for JSON editors", () => {
		const schema = deployConfigJsonSchema();
		expect(schema["additionalProperties"]).toBe(false);
		const properties = schema["properties"] as Record<string, unknown>;
		expect(properties["$schema"]).toBeDefined();
		const endpoints = properties["endpoints"] as Record<string, unknown>;
		expect(endpoints["additionalProperties"]).toBe(false);
	});

	it("keeps $schema out of the TS input type (JSON-editor metadata only)", () => {
		expect(
			// @ts-expect-error $schema is not part of DeployConfigInput —
			// TS configs must not suggest or accept it.
			defineDeployConfig({ $schema: "https://example.com/x.json", appId: 1 }),
		).toMatchObject({ appId: 1 });
	});
});
