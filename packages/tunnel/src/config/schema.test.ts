import fs from "node:fs";
import path from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { defineTunnelConfig } from "./define.ts";
import { tunnelConfigJsonSchema, TunnelConfigSchema, type TunnelConfigInput } from "./schema.ts";

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
		// The top level is what every provider understands; `route` and `api`
		// are opentunnel's and live in its section.
		for (const field of ["provider", "port", "host", "profile", "opentunnel", "cloudflared"]) {
			expect(properties[field]).toBeDefined();
		}
		expect(properties["route"]).toBeUndefined();
		expect(properties["api"]).toBeUndefined();
		expect(schema["additionalProperties"]).toBe(false);
	});
});

describe("provider in the shipped JSON Schema", () => {
	it("is an enumeration of every provider id, not a free string", () => {
		const properties = tunnelConfigJsonSchema()["properties"] as Record<
			string,
			Record<string, unknown> | undefined
		>;
		const provider = properties["provider"];
		if (provider === undefined) {
			throw new Error("the shipped schema has no provider property");
		}
		// Editors offer exactly the ids the registry knows; a typo is a
		// validation error, not a string that fails at connect time.
		const variants = (provider["anyOf"] as Array<{ const?: string }>)
			.map(variant => variant.const)
			.filter((value): value is string => value !== undefined);
		expect(variants.toSorted((left, right) => left.localeCompare(right))).toEqual([
			"cloudflared",
			"opentunnel",
		]);
		expect(provider["default"]).toBe("opentunnel");
	});

	it("types `provider` as the id union", () => {
		expectTypeOf<TunnelConfigInput["provider"]>().toEqualTypeOf<
			"opentunnel" | "cloudflared" | undefined
		>();
	});
});

describe("cloudflared section in the shipped JSON Schema", () => {
	it("enumerates both modes and transports, defaults included", () => {
		const json = tunnelConfigJsonSchema();
		const properties = json["properties"] as Record<
			string,
			Record<string, unknown> | undefined
		>;
		const section = properties["cloudflared"];
		if (section === undefined) {
			throw new Error("the shipped schema has no cloudflared section");
		}
		const text = JSON.stringify(section);
		for (const fragment of [
			'"const":"quick"',
			'"const":"token"',
			'"const":"http2"',
			'"const":"quic"',
			'"default":"quick"',
			'"default":"http2"',
		]) {
			expect(text).toContain(fragment);
		}
		// Strict like the root: a misspelled key is an error, not a default.
		expect(section["additionalProperties"]).toBe(false);
		const keys = section["properties"];
		if (typeof keys !== "object" || keys === null) {
			throw new Error("the cloudflared section has no properties");
		}
		expect(Object.keys(keys).toSorted()).toEqual([
			"binary",
			"hostname",
			"mode",
			"protocol",
			"token",
		]);
	});

	it("is optional at the root", () => {
		expect(TunnelConfigSchema.required ?? []).not.toContain("cloudflared");
	});
});

describe("TunnelConfigSchema", () => {
	it("accepts a full config", () => {
		const config = defineTunnelConfig({
			provider: "opentunnel",
			port: 3000,
			host: "127.0.0.1",
			profile: "my-app",
			opentunnel: { route: "app", api: "https://opentunnel.example" },
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
		expect(properties["host"]?.default).toBe("localhost");
		const opentunnel = TunnelConfigSchema.properties["opentunnel"];
		expect(opentunnel.type).toBe("object");
		// The route default is documented where the key lives now.
		expect(opentunnel.properties["route"]).toMatchObject({ default: "@" });
		expect(
			Object.keys(opentunnel.properties).toSorted((left, right) => left.localeCompare(right)),
		).toEqual(["api", "route"]);
	});
});
