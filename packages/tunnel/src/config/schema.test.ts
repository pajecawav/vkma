import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defineTunnelConfig } from "./define.ts";
import { tunnelConfigJsonSchema, TunnelConfigSchema } from "./schema.ts";

describe("shipped JSON schema", () => {
	it("matches the TypeBox source (no drift)", () => {
		const filePath = path.join(
			import.meta.dirname,
			"..",
			"..",
			"schema",
			"vkma-tunnel.config.schema.json",
		);
		const committed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
		expect(committed).toEqual(tunnelConfigJsonSchema());
	});

	it("is a valid JSON Schema document with an $id", () => {
		const schema = tunnelConfigJsonSchema();
		expect(schema["$schema"]).toContain("json-schema.org");
		expect(typeof schema["$id"]).toBe("string");
		expect(schema["type"]).toBe("object");
		const properties = schema["properties"] as Record<string, unknown>;
		for (const field of ["provider", "port", "host", "route", "profile", "api"]) {
			expect(properties[field]).toBeDefined();
		}
		expect(schema["additionalProperties"]).toBe(false);
	});
});

describe("TunnelConfigSchema", () => {
	it("accepts a full config", () => {
		const config = defineTunnelConfig({
			provider: "opentunnel",
			port: 3000,
			host: "127.0.0.1",
			route: "app",
			profile: "my-app",
			api: "https://opentunnel.example",
		});
		expect(config.port).toBe(3000);
	});

	it("accepts an empty config (everything has defaults)", () => {
		expect(defineTunnelConfig({})).toEqual({});
	});

	it("keeps $schema out of the input type shape at runtime (identity function)", () => {
		const input = { port: 8080 };
		expect(defineTunnelConfig(input)).toBe(input);
	});

	it("documents defaults on the schema object", () => {
		const properties = TunnelConfigSchema.properties as Record<string, { default?: unknown }>;
		expect(properties["provider"]?.default).toBe("opentunnel");
		expect(properties["port"]?.default).toBe(5173);
		expect(properties["host"]?.default).toBe("127.0.0.1");
		expect(properties["route"]?.default).toBe("@");
	});
});
