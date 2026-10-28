import { catalogue, stubs } from "@vkma.dev/bridge-schema/catalogue";
import { catalogue as schemaCatalogue } from "@vkma.dev/bridge-schema/schema";
import { expect, test } from "vitest";

// ---------------------------------------------------------------------------
// The light `./catalogue` entrypoint mirrors the `./schema` wiring tables —
// two copies of the same facts, kept honest by this comparison.
// ---------------------------------------------------------------------------

test("the standalone catalogue matches the schema document's tables", () => {
	expect(catalogue.props).toEqual(schemaCatalogue.props);
	expect(catalogue.receive).toEqual(schemaCatalogue.receive);
	expect(catalogue.events).toEqual(schemaCatalogue.events);
});

// ---------------------------------------------------------------------------
// Stubs: every sendable method has one (all props definitions are object
// shapes), each is a JSON object and JSON-serializable by construction.
// ---------------------------------------------------------------------------

test("every sendable method has a stub", () => {
	for (const method of Object.keys(catalogue.props)) {
		expect(stubs[method], `${method} stub`).toBeInstanceOf(Object);
	}
});

test("stubs carry only the required keys with placeholder values", () => {
	expect(stubs["VKWebAppCreateHash"]).toEqual({});
	expect(stubs["VKWebAppOpenApp"]).toEqual({ app_id: 0 });
	expect(stubs["VKWebAppStorageSet"]).toEqual({ key: "", value: "" });
	// enum → first entry; $ref → resolved through $defs
	expect(stubs["VKWebAppSetViewSettings"]).toEqual({ status_bar_style: "dark" });
	expect(stubs["VKWebAppShowStoryBox"]).toEqual({ background_type: "image" });
});

test("nested objects expand their required keys (CallAPIMethod)", () => {
	expect(stubs["VKWebAppCallAPIMethod"]).toEqual({
		method: "",
		params: { access_token: "", v: "" },
	});
});

test("anyOf resolves to the first object branch (ShowWallPostBox)", () => {
	expect(stubs["VKWebAppShowWallPostBox"]).toEqual({ attachments: "" });
});

test("stubs are JSON-serializable", () => {
	for (const [method, stub] of Object.entries(stubs)) {
		expect(JSON.parse(JSON.stringify(stub)), `${method} round-trip`).toEqual(stub);
	}
});
