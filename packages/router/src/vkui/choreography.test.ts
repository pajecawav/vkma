import { describe, expect, it } from "vitest";
import { idleChoreography, reconcile } from "./choreography.ts";

type Entry = { id: string; routeId: string };

const entry = (id: string): Entry => ({ id, routeId: `/view:feed/post/$id/${id}` });
const completeExit = (state: ReturnType<typeof reconcile<Entry>>) =>
	// mirrors the host's handleClosed: the exit finished, re-reconcile
	// toward the state's own (latest queued) target
	reconcile({ ...state, exiting: null, awaitingExitId: null }, state.target);

describe("modal choreography", () => {
	it("opens the first modal from idle", () => {
		const next = reconcile(idleChoreography<Entry>(), entry("comments"));
		expect(next.stack).toStrictEqual([entry("comments")]);
		expect(next.target).toStrictEqual(entry("comments"));
	});

	it("settles when the target is already open", () => {
		const open = reconcile(idleChoreography<Entry>(), entry("comments"));
		const again = reconcile(open, entry("comments"));
		expect(again.stack).toStrictEqual(open.stack);
		expect(again.exiting).toBeNull();
	});

	it("closes the parent before opening a nested modal", () => {
		const open = reconcile(idleChoreography<Entry>(), entry("comments"));
		const nested = reconcile(open, {
			id: "share",
			routeId: "/view:feed/post/$id/comments/share",
		});
		expect(nested.stack).toStrictEqual([]);
		expect(nested.exiting?.id).toBe("comments");
		expect(nested.target?.id).toBe("share");

		const settled = completeExit(nested);
		expect(settled.stack.map(item => item.id)).toStrictEqual(["share"]);
		expect(settled.exiting).toBeNull();
	});

	it("back to the ancestor closes the child before reopening the parent", () => {
		const open = reconcile(idleChoreography<Entry>(), entry("comments"));
		const nested = completeExit(
			reconcile(open, {
				id: "share",
				routeId: "/view:feed/post/$id/comments/share",
			}),
		);
		const back = reconcile(nested, entry("comments"));
		expect(back.stack).toStrictEqual([]);
		expect(back.exiting?.id).toBe("share");

		const settled = completeExit(back);
		expect(settled.stack.map(item => item.id)).toStrictEqual(["comments"]);
		expect(settled.exiting).toBeNull();
	});

	it("sibling retarget closes the displayed sheet before opening the new one", () => {
		const open = reconcile(idleChoreography<Entry>(), entry("comments"));
		const retarget = reconcile(open, entry("share"));
		expect(retarget.exiting?.id).toBe("comments");
		expect(retarget.stack).toStrictEqual([]);
		const settled = completeExit(retarget);
		expect(settled.stack.map(item => item.id)).toStrictEqual(["share"]);
	});

	it("retargeting back to the exiting sheet CANCELS the exit", () => {
		const open = reconcile(idleChoreography<Entry>(), entry("comments"));
		const retarget = reconcile(open, entry("share")); // comments exiting
		const cancel = reconcile(retarget, entry("comments"));
		expect(cancel.exiting).toBeNull();
		expect(cancel.awaitingExitId).toBeNull();
		expect(cancel.stack.map(item => item.id)).toStrictEqual(["comments"]);
	});

	it("a different retarget during an exit is QUEUED, not dropped", () => {
		const open = reconcile(idleChoreography<Entry>(), entry("comments"));
		const first = reconcile(open, entry("share")); // comments exiting, share queued
		const second = reconcile(first, entry("reactions")); // second retarget mid-exit
		expect(second.target?.id).toBe("reactions");
		// the exit completes: the LATEST target wins, nothing is lost
		const settled = completeExit(second);
		expect(settled.stack.map(item => item.id)).toStrictEqual(["reactions"]);
	});

	it("closing everything exits the open sheet with no queued reopen", () => {
		const open = reconcile(idleChoreography<Entry>(), entry("comments"));
		const closing = reconcile(open, null);
		expect(closing.exiting?.id).toBe("comments");
		expect(closing.target).toBeNull();
		const settled = completeExit(closing);
		expect(settled.stack).toStrictEqual([]);
	});
});
