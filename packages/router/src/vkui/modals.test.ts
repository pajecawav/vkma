import { describe, expect, it } from "vitest";
import { hostProps } from "./modals.tsx";

describe("ModalSurface hostProps", () => {
	const api = {
		nav: "/view:feed/post/$id/comments",
		open: true,
		stacked: true,
		onClose: () => {},
		onClosed: () => {},
	};

	it("passes only the props VKUI accepts", () => {
		expect(hostProps(api)).toStrictEqual({
			nav: api.nav,
			open: api.open,
			onClose: api.onClose,
			onClosed: api.onClosed,
		});
	});

	it("never leaks host-owned keys into the DOM-bound spread", () => {
		// VKUI forwards unknown props to the DOM; a boolean there makes React
		// warn ("Received `false` for a non-boolean attribute `stacked`")
		expect(hostProps(api)).not.toHaveProperty("stacked");
		expect(hostProps({ ...api, stacked: false })).not.toHaveProperty("stacked");
	});
});
