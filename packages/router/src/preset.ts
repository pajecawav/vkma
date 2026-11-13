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
export {
	createVkLink,
	type VkLinkProps,
	type ParamsArg,
	type ParamsMember,
} from "./preset/link.tsx";
export { deriveInflateChain } from "./preset/inflate.ts";
export {
	useNavigator,
	type ModalOpenOptions,
	type PanelPage,
	type VkNavigator,
} from "./preset/navigator.ts";
export { definePanel, panelRouteId, type PanelDefinition } from "./preset/define-panel.ts";
export {
	type ModalComponent,
	type ModalDeclaration,
	type ModalEntryComponent,
} from "./preset/builders.tsx";
export {
	asDeclaration,
	defineGlobalModal,
	definePopout,
	GLOBAL_MODAL,
	MODAL_HANDLE,
	POPOUT_DEFINITION,
	POPOUT_HANDLE,
	type GlobalModalDefinition,
	isGlobalModalDefinition,
	isModalHandle,
	isPopoutDefinition,
	isPopoutHandle,
	type ModalHandle,
	type ModalHandlesOf,
	type ModalPropsOf,
	modalHandlesOf,
	modalProps,
	type PopoutComponent,
	type PopoutDefinition,
	type PopoutHandle,
	type PopoutHandlesOf,
	type PopoutPropsOf,
	popoutHandlesOf,
} from "./preset/overlays.ts";
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
	DefaultPanelPendingComponent,
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
	type ModalRef,
	type PanelRef,
} from "./react.ts";
