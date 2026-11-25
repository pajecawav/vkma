// @vitest-environment happy-dom
import type { ClientInfo, WireEvent } from "@vkma.dev/protocol";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Timeline } from "./Timeline.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

afterEach(() => {
	for (const { root, node } of mounted.splice(0)) {
		act(() => root.unmount());
		node.remove();
	}
});

const client: ClientInfo = {
	clientId: "c-1",
	sessionId: "s-1",
	connectedAt: 0,
	lastSeenAt: 0,
	ua: "Mozilla/5.0",
	url: "http://localhost:5173/",
	platform: "desktop-web",
	bridge: true,
};

const event = (seq: number): WireEvent => ({
	id: seq,
	ts: seq,
	clientId: "c-1",
	direction: "in",
	kind: "event",
	name: `VKWebAppEvent${seq}`,
	seq,
	runId: "run-1",
});

const eventsUntil = (last: number) => Array.from({ length: last }, (_, i) => event(i + 1));

const pauseButton = (node: HTMLElement) =>
	node.querySelector<HTMLButtonElement>('button[aria-label="Pause live tail"]');

const resumeButton = (node: HTMLElement) =>
	node.querySelector<HTMLButtonElement>('button[aria-label^="Resume live tail"]');

describe("Timeline pause", () => {
	it("shows the buffered count on the pause button, not in a button of its own", async () => {
		const timeline = (events: WireEvent[]) => <Timeline events={events} clients={[client]} />;
		const { node, render } = await mount(timeline(eventsUntil(2)));

		await act(async () => {
			pauseButton(node)?.click();
		});
		await render(timeline(eventsUntil(6)));

		const resume = resumeButton(node);
		expect(resume?.getAttribute("aria-label")).toBe("Resume live tail — 4 new events buffered");
		expect(resume?.textContent).toBe("4");
		// The view stayed frozen at the pause point.
		expect(node.querySelectorAll("[data-seq]")).toHaveLength(2);
		expect(
			[...node.querySelectorAll("button")].some(button =>
				/new — resume/.test(button.textContent ?? ""),
			),
		).toBe(false);

		await act(async () => {
			resume?.click();
		});
		expect(resumeButton(node)).toBeNull();
		expect(pauseButton(node)).not.toBeNull();
		expect(node.querySelectorAll("[data-seq]")).toHaveLength(6);
	});

	it("names a plain resume while nothing is buffered", async () => {
		const { node } = await mount(<Timeline events={eventsUntil(2)} clients={[client]} />);
		await act(async () => {
			pauseButton(node)?.click();
		});
		expect(resumeButton(node)?.getAttribute("aria-label")).toBe("Resume live tail");
		expect(resumeButton(node)?.textContent).toBe("");
	});
});

describe("Timeline filter chrome", () => {
	const chrome = (clients: ClientInfo[]) => (
		<Timeline events={eventsUntil(3)} clients={clients} />
	);

	/** Both copies are in the DOM; the container queries pick one. */
	const rows = (node: HTMLElement) =>
		[...(node.querySelector("section")?.children ?? [])].slice(0, 2);

	it("keeps the search at its full width in the single row", async () => {
		const { node } = await mount(chrome([client]));
		const search = rows(node)[0]?.querySelector<HTMLInputElement>(
			'input[aria-label="Filter by event name"]',
		);
		expect(search?.className).toContain("min-w-40");
		expect(search?.className).not.toContain("min-w-24");
		expect(search?.placeholder).toBe("Filter events…");
	});

	it("switches to one row only where it fits, later with the client filter", async () => {
		const one = rows((await mount(chrome([client]))).node);
		expect(one[0]?.className).toContain("@lg:flex");
		expect(one[1]?.className).toContain("@lg:hidden");

		const two = rows((await mount(chrome([client, { ...client, clientId: "c-2" }]))).node);
		expect(two[0]?.className).toContain("@2xl:flex");
		expect(two[1]?.className).toContain("@2xl:hidden");
	});
});
