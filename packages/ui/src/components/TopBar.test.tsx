// @vitest-environment happy-dom
import type { ConnectionStatus } from "@vkma.dev/protocol";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FabPositionControl } from "./FabPositionControl.tsx";
import { TopBar } from "./TopBar.tsx";

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

const theme = { dark: false, toggle: () => {} };

const button = (scope: ParentNode, label: string): HTMLButtonElement | null =>
	scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe("TopBar secondary controls", () => {
	const position = { position: "bottom" as const, onPick: () => {} };
	const radiogroups = (scope: ParentNode) =>
		scope.querySelectorAll('[role="radiogroup"][aria-label="DevTools position"]');

	/** Opens the ⋯ popover; its popup portals to the body. */
	const openMenu = async (node: HTMLElement) => {
		await act(async () => {
			button(node, "More controls")?.click();
		});
	};

	it("renders inline on a wide header and inside the ⋯ popover on a narrow one", async () => {
		const { node } = await mount(
			<TopBar
				status="connected"
				onReconnect={() => {}}
				theme={theme}
				overflow={{
					inline: <FabPositionControl {...position} />,
					menu: <FabPositionControl {...position} variant="list" />,
				}}
			/>,
		);
		// the popover is closed: only the inline copy is mounted
		expect(radiogroups(node)).toHaveLength(1);
		// and the trigger steps aside exactly where that copy shows
		expect(button(node, "More controls")?.className).toContain("@lg:hidden");

		await openMenu(node);
		expect(radiogroups(document.body)).toHaveLength(2);
	});

	it("keeps the ⋯ button at every width when there is no inline copy", async () => {
		const { node } = await mount(
			<TopBar
				status="connected"
				onReconnect={() => {}}
				theme={theme}
				overflow={{ menu: <FabPositionControl {...position} variant="list" /> }}
			/>,
		);
		expect(button(node, "More controls")?.className).not.toContain("@lg:hidden");
		expect(radiogroups(node)).toHaveLength(0);

		await openMenu(node);
		expect(radiogroups(document.body)).toHaveLength(1);
	});
});

describe("TopBar close", () => {
	/** The Escape verdict is deferred past the key's whole dispatch. */
	const settle = () =>
		act(
			() =>
				new Promise<void>(resolve => {
					setTimeout(resolve, 20);
				}),
		);

	const press = (target: EventTarget) =>
		act(async () => {
			target.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
			);
		});

	it("adds the button only when the panel can close itself", async () => {
		const onClose = vi.fn();
		const bare = await mount(
			<TopBar status="connected" onReconnect={() => {}} theme={theme} />,
		);
		expect(button(bare.node, "Close panel")).toBeNull();

		const { node } = await mount(
			<TopBar status="connected" onReconnect={() => {}} theme={theme} onClose={onClose} />,
		);
		await act(async () => {
			button(node, "Close panel")?.click();
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("closes on Escape", async () => {
		const onClose = vi.fn();
		await mount(
			<TopBar status="connected" onReconnect={() => {}} theme={theme} onClose={onClose} />,
		);
		await press(document.body);
		expect(onClose).not.toHaveBeenCalled();
		await settle();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("leaves an Escape that a popup claimed to the popup", async () => {
		const onClose = vi.fn();
		await mount(
			<TopBar status="connected" onReconnect={() => {}} theme={theme} onClose={onClose} />,
		);
		// Registered after the header's listener, like every Base UI popup.
		const claim = (event: KeyboardEvent) => event.preventDefault();
		document.addEventListener("keydown", claim);
		try {
			await press(document.body);
			await settle();
		} finally {
			document.removeEventListener("keydown", claim);
		}
		expect(onClose).not.toHaveBeenCalled();
	});

	it("still sees an Escape that a popup kept from bubbling to the document", async () => {
		const onClose = vi.fn();
		const { node } = await mount(
			<TopBar status="connected" onReconnect={() => {}} theme={theme} onClose={onClose} />,
		);
		// A Base UI popup stops the key at the React root; unclaimed, the
		// panel still has to see it.
		const themeToggle = button(node, "Switch to dark theme");
		await act(async () => {
			themeToggle?.addEventListener("keydown", event => event.stopPropagation());
			themeToggle?.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
			);
		});
		await settle();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("lets a filled field keep its first Escape", async () => {
		const onClose = vi.fn();
		await mount(
			<TopBar status="connected" onReconnect={() => {}} theme={theme} onClose={onClose} />,
		);
		const input = document.createElement("input");
		input.value = "VKWebApp";
		document.body.append(input);
		try {
			input.focus();
			await press(input);
			await settle();
			expect(document.activeElement).not.toBe(input);
			expect(onClose).not.toHaveBeenCalled();

			// focus left the field: the next press is the panel's
			await press(document.body);
			await settle();
			expect(onClose).toHaveBeenCalledTimes(1);
		} finally {
			input.remove();
		}
	});
});

describe("TopBar narrow tiers", () => {
	const spans = (scope: ParentNode, text: string) =>
		[...scope.querySelectorAll("span")].filter(span => span.textContent === text);

	it("yields the wordmark before the badge, and both before the status", async () => {
		const { node } = await mount(
			<TopBar
				status="connected"
				onReconnect={() => {}}
				theme={theme}
				clientBadge={{ clientId: "854fd583-4156" }}
				capture="spy"
			/>,
		);
		// the outer span carries both words
		expect(spans(node, "vkmadevtools")[0]?.className).toContain("@lg:inline");
		// the badge: the short id, then its dot alone
		expect(spans(node, "854fd583")[0]?.className).toContain("@sm:inline-flex");
		const dot = node.querySelector('span[role="img"][aria-label="Client 854fd583"]');
		expect(dot?.className).toContain("@sm:hidden");
		// the capture chip hides but stays announced
		expect(spans(node, "sniffer")[0]?.className).toContain("@sm:inline-flex");
		expect(spans(node, "Capture mode: sniffer")[0]?.className).toContain("sr-only");
		// the status keeps its words at every size — it truncates instead
		const status = spans(node, "Connected").at(-1);
		expect(status?.className).toContain("truncate");
		expect(status?.className).not.toContain("@");
	});

	it("drops the brand text before secondary controls on a dense header", async () => {
		// a sparse header (the standalone panel) keeps its wordmark to 512px
		const sparse = await mount(
			<TopBar status="connected" onReconnect={() => {}} theme={theme} />,
		);
		expect(spans(sparse.node, "vkmadevtools")[0]?.className).toContain("@lg:inline");

		// a FAB panel: inline controls + a close button
		const dense = await mount(
			<TopBar
				status="connected"
				onReconnect={() => {}}
				theme={theme}
				onClose={() => {}}
				overflow={{ inline: <span>inline</span>, menu: <span>menu</span> }}
			/>,
		);
		expect(spans(dense.node, "vkmadevtools")[0]?.className).toContain("@xl:inline");
		// the controls themselves stay inline down to 512px
		const inlineCopy = [...dense.node.querySelectorAll("div")].find(
			div => div.textContent === "inline",
		);
		expect(inlineCopy?.className).toContain("@lg:flex");
		expect(button(dense.node, "More controls")?.className).toContain("@lg:hidden");
	});

	it("hides the reconnect button under the wide tier, where every gate repeats it", async () => {
		const problems: ConnectionStatus[] = ["disconnected", "error"];
		for (const status of problems) {
			const { node } = await mount(
				<TopBar status={status} onReconnect={() => {}} theme={theme} />,
			);
			expect(button(node, "Reconnect")?.parentElement?.className).toContain(
				"@xl:inline-flex",
			);
		}
		const { node } = await mount(
			<TopBar status="connected" onReconnect={() => {}} theme={theme} />,
		);
		expect(button(node, "Reconnect")).toBeNull();
	});
});
