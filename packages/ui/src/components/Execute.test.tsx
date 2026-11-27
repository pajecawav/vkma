// @vitest-environment happy-dom
import type { ClientStatus, ExecResult } from "@vkma.dev/protocol";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PARAMS, parseExecuteDraft } from "../lib/execute-draft.ts";
import { Execute } from "./Execute.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE = "https://app.example.com/web/?vk_app_id=1";
const STUB = { user_id: 0 };
const STUB_TEXT = JSON.stringify(STUB, null, 2);

function client(overrides: Partial<ClientStatus> = {}): ClientStatus {
	return {
		clientId: "c-1",
		sessionId: "s-1",
		connectedAt: 0,
		lastSeenAt: 0,
		ua: "Mozilla/5.0",
		url: PAGE,
		platform: "desktop-web",
		bridge: true,
		online: true,
		...overrides,
	};
}

const execute = vi.fn<(...args: unknown[]) => Promise<ExecResult>>(async () => ({
	status: "ok",
	payload: null,
}));

const mounted: Array<{ root: ReturnType<typeof createRoot>; node: HTMLDivElement }> = [];

/** The hand-rolled probe convention (no @testing-library in this repo). */
async function mount(
	ui: ReactNode,
): Promise<{ node: HTMLDivElement; render: (next: ReactNode) => Promise<void> }> {
	const node = document.createElement("div");
	document.body.append(node);
	const root = createRoot(node);
	mounted.push({ root, node });
	await act(async () => {
		root.render(ui);
	});
	return {
		node,
		render: async next => {
			await act(async () => {
				root.render(next);
			});
		},
	};
}

const paramsField = (node: HTMLElement): HTMLTextAreaElement | null =>
	node.querySelector<HTMLTextAreaElement>("textarea");

const eventField = (node: HTMLElement): HTMLInputElement | null =>
	node.querySelector<HTMLInputElement>('input[aria-label="Event"]');

const sendButton = (node: HTMLElement): HTMLButtonElement | undefined =>
	[...node.querySelectorAll<HTMLButtonElement>("button")].find(
		button => button.textContent === "Send",
	);

/** Types as a keystroke does: through the prototype's setter, so React's
 * value tracker sees a change, then the event it listens for. */
async function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
	const prototype =
		field instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: HTMLInputElement.prototype;
	await act(async () => {
		Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

beforeEach(() => {
	execute.mockClear();
});

afterEach(() => {
	for (const { root, node } of mounted.splice(0)) {
		act(() => root.unmount());
		node.remove();
	}
});

describe("Execute draft", () => {
	it("without a draft the form keeps its own state", async () => {
		const { node } = await mount(
			<Execute clients={[client()]} events={[]} execute={execute} />,
		);
		expect(paramsField(node)?.value).toBe(EMPTY_PARAMS);
		await typeInto(paramsField(node)!, '{\n  "a": 1\n}');
		expect(paramsField(node)?.value).toBe('{\n  "a": 1\n}');
	});

	it("shows the draft in its fields and follows a new one", async () => {
		const first = parseExecuteDraft({
			v: 1,
			name: "VKWebAppGetUserInfo",
			paramsText: STUB_TEXT,
		});
		const { node, render } = await mount(
			<Execute
				clients={[client()]}
				events={[]}
				execute={execute}
				draft={first}
				onDraftChange={() => {}}
			/>,
		);
		expect(eventField(node)?.value).toBe("VKWebAppGetUserInfo");
		expect(paramsField(node)?.value).toBe(STUB_TEXT);

		// another surface's save, or the stored draft landing
		const next = parseExecuteDraft({ v: 1, name: "VKWebAppInit", paramsText: "{}" });
		await render(
			<Execute
				clients={[client()]}
				events={[]}
				execute={execute}
				draft={next}
				onDraftChange={() => {}}
			/>,
		);
		expect(eventField(node)?.value).toBe("VKWebAppInit");
		expect(paramsField(node)?.value).toBe("{}");
	});

	it("an edit reports the whole draft, the other fields intact, and keeps nothing itself", async () => {
		const onDraftChange = vi.fn();
		const draft = parseExecuteDraft({
			v: 1,
			target: "c-1",
			targetUrl: PAGE,
			name: "VKWebAppInit",
			paramsText: STUB_TEXT,
			lastAutoFill: STUB_TEXT,
		});
		const { node } = await mount(
			<Execute
				clients={[client()]}
				events={[]}
				execute={execute}
				draft={draft}
				onDraftChange={onDraftChange}
			/>,
		);
		await typeInto(paramsField(node)!, '{"user_id": 7}');
		expect(onDraftChange).toHaveBeenCalledTimes(1);
		expect(onDraftChange).toHaveBeenCalledWith({ ...draft, paramsText: '{"user_id": 7}' });
		// controlled: until the consumer hands the edit back, the field
		// shows the draft, never a copy of its own
		expect(paramsField(node)?.value).toBe(STUB_TEXT);
	});

	it("picking an event reports the name, the stub it filled and the text it may replace", async () => {
		const onDraftChange = vi.fn();
		const draft = parseExecuteDraft({ v: 1, name: "", paramsText: EMPTY_PARAMS });
		const { node } = await mount(
			<Execute
				clients={[client()]}
				events={[]}
				execute={execute}
				paramsStub={() => STUB}
				draft={draft}
				onDraftChange={onDraftChange}
			/>,
		);
		await typeInto(eventField(node)!, "VKWebAppGetUserInfo");
		expect(onDraftChange).toHaveBeenLastCalledWith({
			v: 1,
			target: "",
			name: "VKWebAppGetUserInfo",
			paramsText: STUB_TEXT,
			lastAutoFill: STUB_TEXT,
		});
	});

	it("a restored target whose page reloaded sends to that page's new client", async () => {
		// the registry lists the reloaded frame first; "other" is the newest
		// client, where a dead target alone would send
		const clients = [
			client({ clientId: "reloaded", url: "https://app.example.com/web/?sign=NEW" }),
			client({ clientId: "other", url: "https://other.example.com/" }),
		];
		const draft = parseExecuteDraft({
			v: 1,
			target: "dead",
			targetUrl: PAGE,
			name: "VKWebAppInit",
			paramsText: "",
		});
		const { node } = await mount(
			<Execute
				clients={clients}
				events={[]}
				execute={execute}
				draft={draft}
				onDraftChange={() => {}}
			/>,
		);
		await act(async () => {
			sendButton(node)?.click();
		});
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledWith("reloaded", "VKWebAppInit", undefined);
	});

	it("undefined means not loaded yet: the form starts empty and adopts the draft when it lands", async () => {
		const { node, render } = await mount(
			<Execute
				clients={[client()]}
				events={[]}
				execute={execute}
				draft={undefined}
				onDraftChange={() => {}}
			/>,
		);
		await typeInto(paramsField(node)!, "typed before storage answered");
		expect(paramsField(node)?.value).toBe("typed before storage answered");

		const draft = parseExecuteDraft({ v: 1, name: "VKWebAppInit", paramsText: "{}" });
		await render(
			<Execute
				clients={[client()]}
				events={[]}
				execute={execute}
				draft={draft}
				onDraftChange={() => {}}
			/>,
		);
		expect(eventField(node)?.value).toBe("VKWebAppInit");
		expect(paramsField(node)?.value).toBe("{}");
	});
});
