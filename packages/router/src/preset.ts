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
export { AppRootShell, useActiveStory, useInflate } from "./preset/app.tsx";
export { deriveInflateChain } from "./preset/inflate.ts";
export { useNavigator, type VkNavigator } from "./preset/navigator.ts";
export { definePanel, panelRouteId, type PanelDefinition } from "./preset/define-panel.ts";
export {
	type ModalComponent,
	type ModalDeclaration,
	type ModalEntryComponent,
} from "./preset/builders.tsx";
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
	type ModalEntry,
} from "./vkui.ts";
export {
	usePanelParams,
	usePanelSearch,
	usePanelLoaderData,
	useModalProps,
	usePanelsHistory,
	useEnableSwipeBack,
	type PanelRef,
} from "./react.ts";
