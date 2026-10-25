export {
	createApp,
	panel,
	type AppHandle,
	type AppOptions,
	type PanelHandle,
	type PanelOptions,
	type PanelHandlesOf,
	type TypedAppHandle,
	type ViewOptions,
} from "./preset/builders.tsx";
export { AppRootShell, useInflate } from "./preset/app.tsx";
export { deriveInflateChain } from "./preset/inflate.ts";
export { useNavigator, type VkNavigator } from "./preset/navigator.ts";
export { definePanel, panelRouteId, type PanelDefinition } from "./preset/define-panel.ts";
export { defineView, type ViewDefinition } from "./preset/define-view.ts";

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
	ModalPageSurface,
	ModalCardSurface,
	Popouts,
	VkView,
	NotFound,
	useShowPopout,
	useHidePopout,
	usePopoutState,
	type ModalComponent,
	type ModalEntry,
} from "./vkui.ts";
export {
	usePanelParams,
	usePanelSearch,
	usePanelLoaderData,
	useModalProps,
	usePanelsHistory,
	type PanelRef,
} from "./react.ts";
