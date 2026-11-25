// @vitest-environment happy-dom
import type { ClientStatus } from "@vkma.dev/protocol";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Clients } from "./Clients.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A realistic launch url: the credentials the card must never show. */
const ORIGINAL_URL =
	"https://app.example.com/web/?vk_app_id=5177159&vk_user_id=791264063&sign=REAL_SIGN&access_token=vk1.a.REAL_TOKEN&vk_platform=desktop_web";
const CREDENTIALS = ["REAL_SIGN", "vk1.a.REAL_TOKEN"];

function client(overrides: Partial<ClientStatus> = {}): ClientStatus {
	return {
		clientId: "c-1",
		sessionId: "s-1",
		connectedAt: 0,
		lastSeenAt: 0,
		ua: "Mozilla/5.0",
		url: ORIGINAL_URL,
		platform: "desktop-web",
		bridge: true,
		appId: "5177159",
		online: true,
		...overrides,
	};
}

const writeText = vi.fn<(text: string) => Promise<void>>();
const mounted: Array<{ root: ReturnType<typeof createRoot>; node: HTMLDivElement }> = [];

/** The hand-rolled probe convention (no @testing-library in this repo). */
async function mount(ui: ReactNode): Promise<HTMLDivElement> {
	const node = document.createElement("div");
	document.body.append(node);
	const root = createRoot(node);
	mounted.push({ root, node });
	await act(async () => {
		root.render(ui);
	});
	return node;
}

const copyAction = (node: HTMLElement): HTMLButtonElement | null =>
	node.querySelector<HTMLButtonElement>('button[aria-label^="Copy "]');

const appIdLabel = (node: HTMLElement): HTMLElement | null =>
	[...node.querySelectorAll("span")].find(span => span.textContent === "app 5177159") ?? null;

beforeEach(() => {
	writeText.mockReset();
	writeText.mockResolvedValue(undefined);
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
});

afterEach(() => {
	for (const { root, node } of mounted.splice(0)) {
		act(() => root.unmount());
		node.remove();
	}
});

describe("Clients copy-url action", () => {
	it("copies the original url, never the masked one the card renders", async () => {
		const node = await mount(<Clients clients={[client()]} copyUrl />);
		const action = copyAction(node);
		expect(action).not.toBeNull();

		await act(async () => {
			action?.click();
		});

		expect(writeText).toHaveBeenCalledTimes(1);
		expect(writeText).toHaveBeenCalledWith(ORIGINAL_URL);
		// the glyph flips to the check while the card still shows nothing
		expect(action?.querySelector(".lucide-check")).not.toBeNull();
		expect(action?.getAttribute("aria-label")).toBe(
			"Copy the original page URL (tokens included)",
		);
		for (const credential of CREDENTIALS) {
			expect(node.textContent).not.toContain(credential);
			expect(node.innerHTML).not.toContain(credential);
		}
		expect(node.textContent).toContain("sign=•••••");
	});

	it("names a plain copy when the url carries nothing to mask", async () => {
		const node = await mount(
			<Clients clients={[client({ url: "http://localhost:5173/" })]} copyUrl />,
		);
		expect(copyAction(node)?.getAttribute("aria-label")).toBe("Copy the page URL");
	});

	it("stays off until a surface opts in", async () => {
		const node = await mount(<Clients clients={[client()]} />);
		expect(copyAction(node)).toBeNull();
		// Without the action the header has room at every width: the app
		// id keeps its place (the inspector's cards lay out as before).
		expect(appIdLabel(node)?.className).toBe("");
	});

	it("lets the app id yield on a narrow card once the action is there", async () => {
		const node = await mount(<Clients clients={[client()]} copyUrl />);
		expect(appIdLabel(node)?.className).toContain("@sm:inline");
	});

	it("is withheld when there is no url to give", async () => {
		const node = await mount(<Clients clients={[client({ url: "" })]} copyUrl />);
		expect(copyAction(node)).toBeNull();
	});

	it("serves an offline client too: its url outlives the page", async () => {
		const node = await mount(<Clients clients={[client({ online: false })]} copyUrl />);
		const action = copyAction(node);
		await act(async () => {
			action?.click();
		});
		expect(writeText).toHaveBeenCalledWith(ORIGINAL_URL);
	});
});
