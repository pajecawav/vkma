import { describe, expect, expectTypeOf, it } from "vitest";
import { definePanel } from "./define-panel.ts";
import {
	defineGlobalModal,
	definePopout,
	isModalHandle,
	modalHandlesOf,
	modalProps,
	popoutHandlesOf,
	type ModalHandle,
} from "./overlays.ts";

const Dummy = (): null => null;

describe("modalHandlesOf", () => {
	it("flattens nested chains to dotted keys with full paths", () => {
		const handles = modalHandlesOf("meeting/$id", {
			share: Dummy,
			attendees: {
				component: Dummy,
				modals: { invite: Dummy },
			},
		});
		expect(handles["share"]?.path).toBe("/meeting/$id/share");
		expect(handles["attendees"]?.path).toBe("/meeting/$id/attendees");
		expect(handles["attendees.invite"]?.path).toBe("/meeting/$id/attendees/invite");
		expect(isModalHandle(handles["share"])).toBe(true);
	});

	it("the index panel roots modal paths at /", () => {
		const handles = modalHandlesOf("index", { settings: Dummy });
		expect(handles["settings"]?.path).toBe("/settings");
	});

	it("a leading slash in the panel path is tolerated", () => {
		const handles = modalHandlesOf("/meeting/$id", { share: Dummy });
		expect(handles["share"]?.path).toBe("/meeting/$id/share");
	});
});

describe("popoutHandlesOf", () => {
	it("carries the registry ids for components and definitions alike", () => {
		const handles = popoutHandlesOf({ delete: Dummy, reset: definePopout("reset", Dummy) });
		expect(handles["delete"]?.id).toBe("delete");
		expect(handles["reset"]?.id).toBe("reset");
	});
});

describe("defineGlobalModal", () => {
	it("brands the definition and stores the id + component", () => {
		const settings = defineGlobalModal("settings", { component: Dummy });
		expect(settings.modal).toBe("settings");
		expect(settings.component).toBe(Dummy);
	});
});

describe("overlay handle typing", () => {
	const Confirm = (_props: { itemId: string; onClose: () => void }): null => null;

	it("panel definitions expose typed modal handles (nested chains flattened)", () => {
		const panel = definePanel("plans", "meeting/$id", {
			modals: {
				share: { component: Dummy, props: modalProps<{ note?: string }>() },
				attendees: {
					component: Dummy,
					modals: { invite: { component: Dummy, props: modalProps<{ role: string }>() } },
				},
				bare: Dummy,
			},
		});
		expectTypeOf(panel.modals.share.types).toEqualTypeOf<
			{ params: { id: string }; props: { note?: string } } | undefined
		>();
		expectTypeOf(panel.modals["attendees.invite"].types).toEqualTypeOf<
			{ params: { id: string }; props: { role: string } } | undefined
		>();
		// a declaration without a props carrier stays unknown (loose)
		expectTypeOf(panel.modals.bare.types).toEqualTypeOf<
			{ params: { id: string }; props: unknown } | undefined
		>();
	});

	it("panel definitions expose typed popout handles (props from the component)", () => {
		const panel = definePanel("plans", "index", {
			popouts: { confirm: Confirm, plain: Dummy },
		});
		// onClose is router-injected: callers supply the rest only
		expectTypeOf(panel.popouts.confirm.types).toEqualTypeOf<
			{ props: { itemId: string } } | undefined
		>();
		expectTypeOf(panel.popouts.plain.types).toEqualTypeOf<{ props: {} } | undefined>();
	});

	it("definePopout infers the props phantom from the component", () => {
		const confirm = definePopout("confirm", Confirm);
		expectTypeOf(confirm.types).toEqualTypeOf<{ props: { itemId: string } } | undefined>();
	});

	it("defineGlobalModal carries the props phantom", () => {
		const settings = defineGlobalModal("settings", {
			component: Dummy,
			props: modalProps<{ title: string }>(),
		});
		expectTypeOf(settings.types).toEqualTypeOf<{ props: { title: string } } | undefined>();
	});

	it("a panel without overlays types its maps as empty", () => {
		const panel = definePanel("feed", "feed", {});
		expectTypeOf(panel.modals).toEqualTypeOf<Record<string, never>>();
		expectTypeOf(panel.popouts).toEqualTypeOf<Record<string, never>>();
	});

	it("the modal handle is structurally branded", () => {
		const panel = definePanel("plans", "meeting/$id", {
			modals: { share: { component: Dummy, props: modalProps<{ note?: string }>() } },
		});
		expectTypeOf(panel.modals.share).toExtend<ModalHandle<{ id: string }, { note?: string }>>();
	});
});
