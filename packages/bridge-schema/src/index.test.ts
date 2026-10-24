import { createRequire } from "node:module";
import type { ReceiveDataMap, ReceiveEventMap, RequestPropsMap } from "@vkma.dev/bridge-schema";
import { catalogue, eventsSchema } from "@vkma.dev/bridge-schema/schema";
import type {
	ReceiveDataMap as UpstreamReceiveDataMap,
	ReceiveEventMap as UpstreamReceiveEventMap,
	RequestPropsMap as UpstreamRequestPropsMap,
} from "@vkontakte/vk-bridge";
import { expect, test } from "vitest";
import { expectTypeOf } from "vitest";

// ---------------------------------------------------------------------------
// Augmentation: extend the catalogue with app-specific events. The assertions
// below are compile-time (enforced by tsc through this file), runtime tests
// follow in the next section.
// ---------------------------------------------------------------------------

declare module "@vkma.dev/bridge-schema" {
	interface RequestPropsMap {
		VKWebAppMyCustomMethod: { foo: string };
	}
	interface ReceiveDataMap {
		VKWebAppMyCustomMethodResult: { bar: number };
		VKWebAppMyCustomMethodFailed: { error_type: string };
		VKWebAppMyCustomEvent: { baz: boolean };
	}
	interface ReceiveEventMap {
		VKWebAppMyCustomMethod: {
			result: "VKWebAppMyCustomMethodResult";
			failed: "VKWebAppMyCustomMethodFailed";
		};
	}
}

expectTypeOf<RequestPropsMap["VKWebAppMyCustomMethod"]>().toEqualTypeOf<{ foo: string }>();
expectTypeOf<ReceiveDataMap["VKWebAppMyCustomMethodResult"]>().toEqualTypeOf<{ bar: number }>();
expectTypeOf<ReceiveEventMap["VKWebAppMyCustomMethod"]>().toEqualTypeOf<{
	result: "VKWebAppMyCustomMethodResult";
	failed: "VKWebAppMyCustomMethodFailed";
}>();
// Positive membership checks — these fail to compile if the augmentation above
// stopped merging into the catalogue.
expectTypeOf<RequestPropsMap>().toHaveProperty("VKWebAppMyCustomMethod");
expectTypeOf<ReceiveDataMap>().toHaveProperty("VKWebAppMyCustomEvent");

// ---------------------------------------------------------------------------
// Parity with the reference devDependency: the catalogue must cover exactly
// the event set of the installed @vkontakte/vk-bridge (bumping the catalog
// version without re-running the bootstrap shows up here immediately).
// The augmented keys are subtracted — augmentation is program-wide, so the
// custom events above would otherwise shadow the upstream comparison.
// ---------------------------------------------------------------------------

type AugmentedKeys =
	| "VKWebAppMyCustomMethod"
	| "VKWebAppMyCustomMethodResult"
	| "VKWebAppMyCustomMethodFailed"
	| "VKWebAppMyCustomEvent";

expectTypeOf<Exclude<keyof RequestPropsMap, AugmentedKeys>>().toEqualTypeOf<
	keyof UpstreamRequestPropsMap
>();
expectTypeOf<Exclude<keyof ReceiveDataMap, AugmentedKeys>>().toEqualTypeOf<
	keyof UpstreamReceiveDataMap
>();
expectTypeOf<Exclude<keyof ReceiveEventMap, AugmentedKeys>>().toEqualTypeOf<
	keyof UpstreamReceiveEventMap
>();

// Wire formats round-trip exactly where the schema is a faithful translation…
expectTypeOf<RequestPropsMap["VKWebAppCreateHash"]>().toEqualTypeOf<
	UpstreamRequestPropsMap["VKWebAppCreateHash"]
>();
expectTypeOf<ReceiveDataMap["VKWebAppGetUserInfo"]>().toEqualTypeOf<
	UpstreamReceiveDataMap["VKWebAppGetUserInfo"]
>();
expectTypeOf<ReceiveDataMap["VKWebAppGetGeodata"]>().toEqualTypeOf<
	UpstreamReceiveDataMap["VKWebAppGetGeodata"]
>();
// …and stay mutually assignable where the translation is only equivalent
// (generic instantiation, distributed intersections).
expectTypeOf<RequestPropsMap["VKWebAppOpenPayForm"]>().toExtend<
	UpstreamRequestPropsMap["VKWebAppOpenPayForm"]
>();
expectTypeOf<UpstreamRequestPropsMap["VKWebAppOpenPayForm"]>().toExtend<
	RequestPropsMap["VKWebAppOpenPayForm"]
>();
expectTypeOf<RequestPropsMap["VKWebAppShowWallPostBox"]>().toExtend<
	UpstreamRequestPropsMap["VKWebAppShowWallPostBox"]
>();
expectTypeOf<UpstreamRequestPropsMap["VKWebAppShowWallPostBox"]>().toExtend<
	RequestPropsMap["VKWebAppShowWallPostBox"]
>();
// The wiring is data — it must match upstream exactly, irregular pairs included.
expectTypeOf<ReceiveEventMap["VKWebAppGetAuthToken"]>().toEqualTypeOf<{
	result: "VKWebAppAccessTokenReceived";
	failed: "VKWebAppAccessTokenFailed";
}>();

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);

test("the catalogue covers the documented event set", () => {
	expect(Object.keys(catalogue.props)).toHaveLength(96);
	expect(Object.keys(catalogue.receive)).toHaveLength(115);
	expect(Object.keys(catalogue.events)).toHaveLength(94);
});

test("every catalogue entry points at an existing definition", () => {
	const defs = eventsSchema.$defs;
	for (const def of [...Object.values(catalogue.props), ...Object.values(catalogue.receive)]) {
		expect(defs[def], `definition ${def}`).toBeDefined();
	}
});

test("wiring pairs are strings and the known irregular pair is preserved", () => {
	expect(catalogue.events["VKWebAppGetAuthToken"]).toEqual({
		result: "VKWebAppAccessTokenReceived",
		failed: "VKWebAppAccessTokenFailed",
	});
	expect(catalogue.events["VKWebAppInit"]).toEqual({
		result: "VKWebAppInitResult",
		failed: "VKWebAppInitFailed",
	});
	expect(catalogue.props["VKWebAppCreateHash"]).toBe("CreateHashRequest");
	expect(catalogue.receive["VKWebAppGetUserInfo"]).toBe("UserInfo");
});
