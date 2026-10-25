export {
	createApp,
	type AppHandle,
	type AppOptions,
	type PanelOptions,
	type ViewOptions,
} from "./preset/builders.tsx";
export { AppRootShell } from "./preset/app.tsx";
export { useNavigator, type VkNavigator } from "./preset/navigator.ts";

// the batteries a mini app almost always needs, one import away
export {
	createVkHistory,
	createBridgeSync,
	createSwipeBackManager,
	normalizeBridgeEvent,
	type VkBridgeLike,
} from "./index.ts";
export {
	Modals,
	Popouts,
	VkView,
	NotFound,
	useShowPopout,
	useHidePopout,
	usePopoutState,
} from "./vkui.ts";
export { usePanelParams, usePanelSearch, usePanelLoaderData, usePanelsHistory } from "./react.ts";
