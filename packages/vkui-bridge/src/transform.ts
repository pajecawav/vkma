import type { AdaptivityProps } from "@vkontakte/vkui";
import {
	getViewHeightByViewportHeight,
	getViewWidthByViewportWidth,
	ViewWidth,
} from "@vkontakte/vkui";
import type { BridgeAdaptivity } from "./config.ts";

/**
 * Host-derived adaptivity → `AdaptivityProvider` props (the classic
 * `transformVKBridgeAdaptivity` helper): `adaptive` derives view dimensions
 * from the host viewport, the force-mobile directives squeeze every layout
 * into the mobile/compact pair, `null` leaves the decision to VKUI.
 */
export function transformVKBridgeAdaptivity({
	type,
	viewportWidth,
	viewportHeight,
}: BridgeAdaptivity): AdaptivityProps {
	switch (type) {
		case "adaptive":
			return {
				viewWidth: getViewWidthByViewportWidth(viewportWidth),
				viewHeight: getViewHeightByViewportHeight(viewportHeight),
			};
		case "force_mobile":
		case "force_mobile_compact":
			return {
				viewWidth: ViewWidth.MOBILE,
				density: type === "force_mobile_compact" ? "compact" : "regular",
			};
	}
	return {};
}
