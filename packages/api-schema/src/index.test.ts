import { safeParse } from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	AppsGetFriendsListExtendedResponse,
	AppsGetFriendsListResponse,
	MethodMap,
} from "./index.js";
import { API_VERSION, AdsAdApprovedEnumNames } from "./index.js";
import { BaseObjectSchema } from "./valibot.js";
import { MethodSchemas as ValibotMethodSchemas } from "./valibot.js";
import { AppsGetCatalogParamsSchema, MethodSchemas } from "./zod.js";

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

	it("MethodMap: response presence and variant unions at the type level", () => {
		type HasResponse<M extends keyof MethodMap> = "response" extends keyof MethodMap[M]
			? true
			: false;
		expectTypeOf<HasResponse<"ads.getAccounts">>().toEqualTypeOf<true>();
		expectTypeOf<HasResponse<"account.setOnline">>().toEqualTypeOf<false>();
		expectTypeOf<MethodMap["apps.getFriendsList"]["response"]>().toEqualTypeOf<
			AppsGetFriendsListResponse | AppsGetFriendsListExtendedResponse
		>();
	});

	it("MethodSchemas: runtime lookups mirror the map", () => {
		expect(MethodSchemas["apps.getCatalog"].params.safeParse({}).success).toBe(true);
		expect("response" in MethodSchemas["ads.getAccounts"]).toBe(true);
		expect("response" in MethodSchemas["account.setOnline"]).toBe(false);
		expect(safeParse(ValibotMethodSchemas["apps.getCatalog"].params, {}).success).toBe(true);
		expect("response" in ValibotMethodSchemas["account.setOnline"]).toBe(false);
	});
});
