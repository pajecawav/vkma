import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isPeerIdPinned,
	mintPeerId,
	pinPeerId,
	resolvePeerId,
	rotatePeerId,
	stopClaimGuard,
	unpinPeerId,
} from "./peer-id.ts";

const PEER_ID_KEY = "vkma:inspect:peer-id";
const PEER_ID_PIN_KEY = "vkma:inspect:peer-id-pin";
const PEER_ID_CHANNEL = "vkma:inspect:peer-id";

describe("peer ids", () => {
	afterEach(() => {
		// the claim guard is module state that outlives a test
		stopClaimGuard();
		sessionStorage.clear();
		localStorage.clear();
	});

	it("mints the capability shape", () => {
		const id = mintPeerId();
		expect(id).toMatch(/^vkma-inspect-[a-zA-Z0-9]{26}$/);
		expect(mintPeerId()).not.toBe(id);
	});

	it("prefers this tab's stored id (sessionStorage)", async () => {
		sessionStorage.setItem(PEER_ID_KEY, "vkma-inspect-sessiontab");
		vi.useFakeTimers();
		try {
			const promise = resolvePeerId();
			await vi.advanceTimersByTimeAsync(1000);
			await expect(promise).resolves.toBe("vkma-inspect-sessiontab");
		} finally {
			vi.useRealTimers();
		}
	});

	it("a pinned id is adopted by a fresh tab", async () => {
		sessionStorage.clear();
		pinPeerId("vkma-inspect-seed");
		vi.useFakeTimers();
		try {
			const promise = resolvePeerId();
			await vi.advanceTimersByTimeAsync(1000);
			await expect(promise).resolves.toBe("vkma-inspect-seed");
			// the settled id is also this tab's session id now
			expect(sessionStorage.getItem(PEER_ID_KEY)).toBe("vkma-inspect-seed");
		} finally {
			vi.useRealTimers();
		}
	});

	it("an upgrade-era seed is NOT a pin: fresh tabs mint their own id", async () => {
		sessionStorage.clear();
		// what the pre-pin version left in localStorage
		localStorage.setItem(PEER_ID_KEY, "vkma-inspect-legacy");
		vi.useFakeTimers();
		try {
			const promise = resolvePeerId();
			await vi.advanceTimersByTimeAsync(1000);
			const id = await promise;
			// the switch reads false and the legacy id is not adopted
			expect(id).not.toBe("vkma-inspect-legacy");
			expect(isPeerIdPinned()).toBe(false);
			expect(localStorage.getItem(PEER_ID_PIN_KEY)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("a pinned tab loses the claim to a living incumbent and mints session-local", async () => {
		pinPeerId("vkma-inspect-held");
		sessionStorage.clear();
		// the incumbent speaks for the pinned id and answers claims
		const incumbent = new BroadcastChannel(PEER_ID_CHANNEL);
		const claims: string[] = [];
		incumbent.addEventListener("message", event => {
			const message = event.data;
			if (message.type === "claim" && message.id === "vkma-inspect-held") {
				claims.push(message.token);
				// BroadcastChannel.postMessage takes only the message — there
				// is no targetOrigin (the rule is a false positive here).
				// oxlint-disable-next-line unicorn/require-post-message-target-origin
				incumbent.postMessage({ type: "taken", id: message.id, token: message.token });
			}
		});
		try {
			const id = await resolvePeerId();
			expect(claims.length).toBeGreaterThan(0); // it really asked
			expect(id).not.toBe("vkma-inspect-held");
			expect(id).toMatch(/^vkma-inspect-/);
			// the replacement is this tab's session id…
			expect(sessionStorage.getItem(PEER_ID_KEY)).toBe(id);
			// …and the pin still names the incumbent's id — that is what
			// the already-distributed snippets point at
			expect(localStorage.getItem(PEER_ID_PIN_KEY)).toBe("vkma-inspect-held");
		} finally {
			incumbent.close();
		}
	});

	it("a fresh tab mints a session-local id and never writes the pin on its own", async () => {
		vi.useFakeTimers();
		try {
			const promise = resolvePeerId();
			await vi.advanceTimersByTimeAsync(1000);
			const id = await promise;
			expect(id).toMatch(/^vkma-inspect-/);
			// the settled id is this tab's session id…
			expect(sessionStorage.getItem(PEER_ID_KEY)).toBe(id);
			// …but localStorage stays untouched — the id must not outlive
			// the tab unless the operator pinned it (the broker hands a
			// stopped id to whoever registers it first)
			expect(localStorage.getItem(PEER_ID_KEY)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("pins and unpins explicitly", async () => {
		expect(isPeerIdPinned()).toBe(false);
		const id = await resolvePeerId();
		pinPeerId(id);
		expect(isPeerIdPinned()).toBe(true);
		expect(localStorage.getItem(PEER_ID_PIN_KEY)).toBe(id);
		unpinPeerId();
		expect(isPeerIdPinned()).toBe(false);
		expect(localStorage.getItem(PEER_ID_PIN_KEY)).toBeNull();
	});

	it("rotate re-pins the replacement when pinned (a burned id never revives)", async () => {
		const first = await resolvePeerId();
		pinPeerId(first);
		const second = rotatePeerId();
		expect(second).not.toBe(first);
		// the pin follows the rotation: fresh tabs adopt the NEW id…
		expect(localStorage.getItem(PEER_ID_PIN_KEY)).toBe(second);
		expect(sessionStorage.getItem(PEER_ID_KEY)).toBe(second);
	});

	it("rotate leaves an unpinned id out of localStorage and sweeps the legacy seed", async () => {
		localStorage.setItem(PEER_ID_KEY, "vkma-inspect-legacy");
		await resolvePeerId();
		rotatePeerId();
		expect(localStorage.getItem(PEER_ID_PIN_KEY)).toBeNull();
		expect(localStorage.getItem(PEER_ID_KEY)).toBeNull();
		expect(isPeerIdPinned()).toBe(false);
	});

	it("keeps speaking for its id after settling (later duplicates resolve too)", async () => {
		sessionStorage.setItem(PEER_ID_KEY, "vkma-inspect-mine");
		const id = await resolvePeerId();
		expect(id).toBe("vkma-inspect-mine");

		// hours later a second tab claims the same id: the settled tab
		// must reject it, or two live peers race for one broker id
		const answers: unknown[] = [];
		const claimant = new BroadcastChannel(PEER_ID_CHANNEL);
		claimant.addEventListener("message", event => {
			if (event.data.type === "taken") {
				answers.push(event.data);
			}
		});
		try {
			// BroadcastChannel.postMessage takes only the message — there
			// is no targetOrigin (the rule is a false positive here).
			// oxlint-disable-next-line unicorn/require-post-message-target-origin
			claimant.postMessage({ type: "claim", id, token: "t-other" });
			await new Promise(resolve => setTimeout(resolve, 50));
			expect(answers).toEqual([{ type: "taken", id, token: "t-other" }]);
		} finally {
			claimant.close();
		}
	});

	it("rotates to a fresh id persisted for this tab", () => {
		const id = rotatePeerId();
		expect(id).toMatch(/^vkma-inspect-/);
		expect(sessionStorage.getItem(PEER_ID_KEY)).toBe(id);
	});
});
