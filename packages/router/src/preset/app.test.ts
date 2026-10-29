import { describe, expect, it } from "vitest";
import { owningViewIdOf } from "./app.tsx";

const views = [{ id: "/view:profile" }, { id: "/view:feed" }, { id: "/view:more" }];

function match(routeId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return { routeId, ...extra };
}

describe("owningViewIdOf", () => {
	it("the deepest match's owning view wins", () => {
		const matches = [match("/"), match("/view:feed"), match("/view:feed/feed")];
		expect(owningViewIdOf(matches, views)).toBe("/view:feed");
	});

	it("a modal child route (deeper than the panel) still resolves to its view", () => {
		const matches = [
			match("/"),
			match("/view:feed"),
			match("/view:feed/feed"),
			match("/view:feed/feed/comments"),
		];
		expect(owningViewIdOf(matches, views)).toBe("/view:feed");
	});

	it("the view route itself as the deepest match owns the story", () => {
		const matches = [match("/"), match("/view:more")];
		expect(owningViewIdOf(matches, views)).toBe("/view:more");
	});

	it("a notFound status anywhere in the chain nulls the story", () => {
		const matches = [match("/"), match("/view:feed", { status: "notFound" })];
		expect(owningViewIdOf(matches, views)).toBeNull();
	});

	it("TanStack's internal _notFound flag nulls the story too", () => {
		const matches = [match("/", { _notFound: true })];
		expect(owningViewIdOf(matches, views)).toBeNull();
	});

	it("no owning view resolves to null (the shell renders NotFound)", () => {
		const matches = [match("/")];
		expect(owningViewIdOf(matches, views)).toBeNull();
	});
});
