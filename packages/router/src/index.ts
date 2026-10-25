export {
	DEFAULT_PATH_PARAM,
	createVkHistory,
	type VkHistory,
	type VkHistoryOptions,
} from "./core/vk-history.ts";
export {
	applyLocation,
	initialPanelsStack,
	panelsHistoryOf,
	type PanelsStackState,
} from "./core/panels-stack.ts";
export { POPOUT_STATE_KEY, readPopoutState, type PopoutState } from "./core/state-keys.ts";
export { createBridgeSync, type BridgeSyncOptions } from "./core/bridge-sync.ts";
export { createSwipeBackManager } from "./core/swipe-back.ts";
export {
	normalizeBridgeEvent,
	type BridgeEventEnvelope,
	type VkBridgeLike,
} from "./core/bridge-like.ts";
export {
	readHashParams,
	writeHashParams,
	serializeHashPayload,
	parseHashPayload,
} from "./core/hash-params.ts";
