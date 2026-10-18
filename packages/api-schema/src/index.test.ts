import { safeParse } from "valibot";
import { describe, expect, it } from "vitest";
import { API_VERSION, AdsAdApprovedEnumNames } from "./index.js";
import { BaseObjectSchema } from "./valibot.js";
import { AppsGetCatalogParamsSchema } from "./zod.js";

describe("api-schema", () => {
	it("exports the API version from the schema", () => {
		expect(API_VERSION).toBe("5.199");
	});

	it("generates EnumNames constants from enum + enumNames", () => {
		expect(AdsAdApprovedEnumNames).toEqual({
			NOT_MODERATED: 0,
			PENDING_MODERATION: 1,
			APPROVED: 2,
			REJECTED: 3,
		});
	});

	it("zod: parses method params and rejects invalid enum values", () => {
		expect(AppsGetCatalogParamsSchema.safeParse({}).success).toBe(true);
		expect(AppsGetCatalogParamsSchema.safeParse({ count: 10, sort: "visitors" }).success).toBe(
			true,
		);
		expect(AppsGetCatalogParamsSchema.safeParse({ sort: "bogus" }).success).toBe(false);
	});

	it("valibot: parses objects and rejects invalid payloads", () => {
		expect(safeParse(BaseObjectSchema, { id: 1, title: "app" }).success).toBe(true);
		expect(safeParse(BaseObjectSchema, { id: "nope", title: "app" }).success).toBe(false);
		expect(safeParse(BaseObjectSchema, { id: 1 }).success).toBe(false);
	});
});
