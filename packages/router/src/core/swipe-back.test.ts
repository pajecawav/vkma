import { describe, expect, it } from "vitest";
import { createSwipeBackManager } from "./swipe-back.ts";

interface Harness {
	sent: string[];
	setIndex(index: number | undefined): void;
	setOverride(enabled: boolean | null): void;
	destroy(): void;
}

const make = (options?: { enabled?: boolean }): Harness => {
	const sent: string[] = [];
	let index: number | undefined = 0;
	const listeners = new Set<() => void>();
	const manager = createSwipeBackManager({
		bridge: {
			send: async (type: string) => {
				sent.push(type);
			},
			subscribe: () => () => {},
		},
		history: {
			get location() {
				return { state: index === undefined ? undefined : { __TSR_index: index } };
			},
			subscribe: listener => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		},
		...options,
	});
	return {
		sent,
		setIndex(next) {
			index = next;
			for (const listener of listeners) {
				listener();
			}
		},
		setOverride: manager.setOverride,
		destroy: manager.destroy,
	};
};

describe("swipe-back manager", () => {
	it("enables on a pushed entry and disables on the first entry", () => {
		const h = make();
		h.setIndex(1);
		expect(h.sent).toContain("VKWebAppEnableSwipeBack");
		h.setIndex(0);
		expect(h.sent).toContain("VKWebAppDisableSwipeBack");
	});

	it("stays disabled on the first entry (system back closes the app)", () => {
		const h = make();
		expect(h.sent).toContain("VKWebAppDisableSwipeBack");
		expect(h.sent).not.toContain("VKWebAppEnableSwipeBack");
	});

	it("hard opt-out never enables, whatever the history does", () => {
		const h = make({ enabled: false });
		h.setIndex(3);
		expect(h.sent).not.toContain("VKWebAppEnableSwipeBack");
	});

	it("an override replaces the automatic decision, null returns to it", () => {
		const h = make();
		h.setOverride(false); // first entry: auto says disabled, no change
		expect(h.sent.filter(type => type.includes("SwipeBack"))).toHaveLength(1);
		h.setIndex(2); // auto says enabled. The override keeps it off
		expect(h.sent).not.toContain("VKWebAppEnableSwipeBack");
		h.setOverride(null); // back to automatic → now enabled
		expect(h.sent).toContain("VKWebAppEnableSwipeBack");
		const before = h.sent.filter(type => type.includes("SwipeBack")).length;
		h.setOverride(true);
		h.setIndex(0); // auto says disabled. The override keeps it on, no flapping
		expect(h.sent.filter(type => type.includes("SwipeBack"))).toHaveLength(before);
	});

	it("a foreign entry without state counts as disabled", () => {
		const h = make();
		h.setIndex(undefined);
		expect(h.sent).toContain("VKWebAppDisableSwipeBack");
		expect(h.sent).not.toContain("VKWebAppEnableSwipeBack");
	});
});
