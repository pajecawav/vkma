import { describe, expect, it } from "vitest";
import { hostProps } from "./modals.tsx";

describe("ModalSurface hostProps", () => {
	const api = {
		nav: "/view:feed/post/$id/comments",
		open: true,
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
});
