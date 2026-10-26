import { describe, expect, it, vi } from "vitest";
import { mintPeerId, resolvePeerId, rotatePeerId } from "./peer-id.ts";

describe("peer ids", () => {
	it("mints the capability shape", () => {
		const id = mintPeerId();
		expect(id).toMatch(/^vkma-inspect-[a-zA-Z0-9]{26}$/);
		expect(mintPeerId()).not.toBe(id);
	});

	it("prefers this tab's stored id (sessionStorage)", async () => {
		sessionStorage.setItem("vkma:inspect:peer-id", "vkma-inspect-sessiontab");
		vi.useFakeTimers();
		try {
			const promise = resolvePeerId();
			await vi.advanceTimersByTimeAsync(1000);
			await expect(promise).resolves.toBe("vkma-inspect-sessiontab");
		} finally {
			vi.useRealTimers();
		}
	});

	it("seeds a fresh tab from localStorage", async () => {
		sessionStorage.clear();
		localStorage.setItem("vkma:inspect:peer-id", "vkma-inspect-seed");
		vi.useFakeTimers();
		try {
			const promise = resolvePeerId();
			await vi.advanceTimersByTimeAsync(1000);
			await expect(promise).resolves.toBe("vkma-inspect-seed");
			// the settled id is also this tab's session id now
			expect(sessionStorage.getItem("vkma:inspect:peer-id")).toBe("vkma-inspect-seed");
		} finally {
			vi.useRealTimers();
		}
	});

	it("rotates to a fresh id persisted for this tab", () => {
		const id = rotatePeerId();
		expect(id).toMatch(/^vkma-inspect-/);
		expect(sessionStorage.getItem("vkma:inspect:peer-id")).toBe(id);
		expect(localStorage.getItem("vkma:inspect:peer-id")).toBe(id);
	});
});
