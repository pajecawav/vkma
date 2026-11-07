import type { VkmaBridge } from "@vkma.dev/bridge";
import { useSyncExternalStore } from "react";
import { currentUser, findFakeUser, friends, toFriendInfo, toUserInfo } from "./api";
import { hostMode, prepareBridgeForHost } from "./mode";
import type {
	HostAdaptivity,
	HostAppearance,
	HostInsets,
	HostLab,
	HostLabActions,
	HostLabSnapshot,
	HostOutcome,
	HostScheme,
	HostViewport,
} from "./types";

const STORAGE_KEY = "vkma:planner:fake-host-storage:v1";
const FRAME_ID = "vkma-fake-host";
const MAX_HOST_STACK = 50;

const SUPPORTED_HANDLERS = [
	"SetSupportedHandlers",
	"VKWebAppInit",
	"VKWebAppGetConfig",
	"VKWebAppGetUserInfo",
	"VKWebAppGetFriends",
	"VKWebAppShowInviteBox",
	"VKWebAppShowSlidesSheet",
	"VKWebAppShare",
	"VKWebAppAddToFavorites",
	"VKWebAppStorageGet",
	"VKWebAppStorageGetKeys",
	"VKWebAppStorageSet",
	"VKWebAppSetLocation",
	"VKWebAppSetSwipeSettings",
	"VKWebAppEnableSwipeBack",
	"VKWebAppDisableSwipeBack",
] as const;

interface HostState {
	appearance: HostAppearance;
	scheme: HostScheme;
	insets: HostInsets;
	adaptivity: HostAdaptivity;
	viewport: HostViewport;
	latencyMs: number;
	outcome: HostOutcome;
	storage: Record<string, string>;
	hostStack: string[];
	lastLocation: string;
}

interface VkConnectRequest {
	handler: string;
	params: Record<string, unknown>;
}

class FakeHostError extends Error {
	public constructor(
		public readonly code: number,
		public readonly reason: string,
	) {
		super(reason);
		this.name = "FakeHostError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPersistedStorage(): Record<string, string> {
	if (typeof window === "undefined") {
		return {};
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return {};
		}
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) {
			return {};
		}
		return Object.fromEntries(
			Object.entries(parsed).filter((entry): entry is [string, string] => {
				return typeof entry[1] === "string";
			}),
		);
	} catch {
		return {};
	}
}

function defaultViewport(): HostViewport {
	return {
		width: typeof window === "undefined" ? 390 : window.innerWidth,
		height: typeof window === "undefined" ? 844 : window.innerHeight,
	};
}

function createDefaultState(): HostState {
	return {
		appearance: "light",
		scheme: "bright_light",
		insets: { top: 0, right: 0, bottom: 0, left: 0 },
		adaptivity: "adaptive",
		viewport: defaultViewport(),
		latencyMs: 60,
		outcome: "success",
		storage: readPersistedStorage(),
		hostStack: ["/"],
		lastLocation: "/",
	};
}

let installed = false;
let state = createDefaultState();
const listeners = new Set<() => void>();

function makeSnapshot(): HostLabSnapshot {
	return {
		active: installed,
		fake: hostMode === "fake",
		appearance: state.appearance,
		scheme: state.scheme,
		insets: { ...state.insets },
		adaptivity: state.adaptivity,
		viewport: { ...state.viewport },
		viewportWidth: state.viewport.width,
		viewportHeight: state.viewport.height,
		latencyMs: state.latencyMs,
		outcome: state.outcome,
		storage: { ...state.storage },
		hostStack: [...state.hostStack],
		lastLocation: state.lastLocation,
	};
}

let snapshot = makeSnapshot();

function publish(): void {
	snapshot = makeSnapshot();
	for (const listener of listeners) {
		listener();
	}
}

function commit(next: Partial<HostState>): void {
	state = { ...state, ...next };
	publish();
}

export function getHostLabSnapshot(): HostLabSnapshot {
	return snapshot;
}

export function subscribeHostLab(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function configData(): object {
	return {
		app_id: "51999999",
		app: "vkclient",
		api_host: "https://api.vk.ru",
		appearance: state.appearance,
		scheme: state.scheme,
		adaptivity: state.adaptivity,
		viewport_width: state.viewport.width,
		viewport_height: state.viewport.height,
		insets: { ...state.insets },
	};
}

function emitHostEvent(type: string, data: object): void {
	if (!installed || hostMode !== "fake" || typeof window === "undefined") {
		return;
	}
	window.postMessage({ type, data }, "*");
}

function emitConfig(): void {
	emitHostEvent("VKWebAppUpdateConfig", configData());
}

function emitInsets(): void {
	emitHostEvent("VKWebAppUpdateInsets", { insets: { ...state.insets } });
}

function emitLocation(location: string): void {
	emitHostEvent("VKWebAppChangeFragment", { location });
}

function persistStorage(): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
	} catch {
		// Storage can be unavailable in private browsing; the in-memory fake still works.
	}
}

function schemeForAppearance(appearance: HostAppearance): HostScheme {
	if (appearance === "dark") {
		return state.scheme === "vkcom_dark" ? "vkcom_dark" : "space_gray";
	}
	return state.scheme === "vkcom_light" ? "vkcom_light" : "bright_light";
}

function normalizedLocation(location: string): string {
	return location.trim() || "/";
}

function pushLocation(location: string, replace: boolean): void {
	const nextStack = replace
		? [...state.hostStack.slice(0, -1), location]
		: [...state.hostStack, location];
	commit({
		lastLocation: location,
		hostStack: nextStack.slice(-MAX_HOST_STACK),
	});
}

export const hostLabActions: HostLabActions = {
	setAppearance(appearance, scheme) {
		if (hostMode !== "fake") {
			return;
		}
		commit({ appearance, scheme: scheme ?? schemeForAppearance(appearance) });
		emitConfig();
	},
	setInsets(insets) {
		if (hostMode !== "fake") {
			return;
		}
		const next = { ...state.insets };
		for (const side of ["top", "right", "bottom", "left"] as const) {
			const value = insets[side];
			if (typeof value === "number" && Number.isFinite(value)) {
				next[side] = Math.max(0, value);
			}
		}
		commit({ insets: next });
		emitInsets();
	},
	setAdaptivity(adaptivity, viewport) {
		if (hostMode !== "fake") {
			return;
		}
		const nextViewport = { ...state.viewport };
		for (const dimension of ["width", "height"] as const) {
			const value = viewport?.[dimension];
			if (typeof value === "number" && Number.isFinite(value)) {
				nextViewport[dimension] = Math.max(1, Math.round(value));
			}
		}
		commit({ adaptivity, viewport: nextViewport });
		emitConfig();
	},
	setLatency(latencyMs) {
		if (hostMode === "fake" && Number.isFinite(latencyMs)) {
			commit({ latencyMs: Math.max(0, latencyMs) });
		}
	},
	setOutcome(outcome) {
		if (hostMode === "fake") {
			commit({ outcome });
		}
	},
	hostJump(location) {
		if (hostMode !== "fake") {
			return;
		}
		const nextLocation = normalizedLocation(location);
		pushLocation(nextLocation, false);
		emitLocation(nextLocation);
	},
	resendLocation() {
		if (hostMode === "fake") {
			emitLocation(state.lastLocation);
		}
	},
	clearStorage() {
		if (hostMode !== "fake") {
			return;
		}
		commit({ storage: {} });
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch {
			// The snapshot is cleared even when persistent storage is unavailable.
		}
	},
	reset() {
		if (hostMode !== "fake") {
			return;
		}
		const storage = state.storage;
		state = { ...createDefaultState(), storage };
		publish();
		emitConfig();
		emitInsets();
		emitLocation(state.lastLocation);
	},
};

export function useHostLab(): HostLab {
	const currentSnapshot = useSyncExternalStore(
		subscribeHostLab,
		getHostLabSnapshot,
		getHostLabSnapshot,
	);
	return { snapshot: currentSnapshot, actions: hostLabActions };
}

function requestIdOf(params: Record<string, unknown>): string | number | undefined {
	const requestId = params["request_id"];
	return typeof requestId === "string" || typeof requestId === "number" ? requestId : undefined;
}

function withRequestId(data: object, requestId: string | number | undefined): object {
	return requestId === undefined ? { ...data } : { ...data, request_id: requestId };
}

function postResponse(
	method: string,
	data: object,
	requestId: string | number | undefined,
	failed = false,
): void {
	const type = failed
		? `${method}Failed`
		: method === "SetSupportedHandlers"
			? method
			: `${method}Result`;
	window.postMessage({ type, data: withRequestId(data, requestId) }, "*");
}

function outcomeError(method: string, outcome: Exclude<HostOutcome, "success">): object {
	const denied = outcome === "denied";
	return {
		error_type: "client_error",
		error_data: {
			error_code: denied ? 4 : 1,
			error_reason: denied ? "User denied the request" : "Fake host failure",
			error_description: denied
				? `The fake user denied ${method}`
				: `The fake host failed ${method} by request`,
		},
	};
}

function clientError(error: unknown): object {
	if (error instanceof FakeHostError) {
		return {
			error_type: "client_error",
			error_data: {
				error_code: error.code,
				error_reason: error.reason,
			},
		};
	}
	return {
		error_type: "client_error",
		error_data: {
			error_code: 1,
			error_reason: "Unexpected fake host error",
		},
	};
}

function requiredString(params: Record<string, unknown>, key: string): string {
	const value = params[key];
	if (typeof value !== "string" || (key === "key" && value.length === 0)) {
		throw new FakeHostError(1, `Parameter "${key}" must be a string`);
	}
	return value;
}

function userIdFromParams(params: Record<string, unknown>): number {
	if (typeof params["user_id"] === "number") {
		return params["user_id"];
	}
	if (typeof params["user_ids"] === "string" && params["user_ids"].length > 0) {
		const userId = Number(params["user_ids"].split(",")[0]);
		if (Number.isInteger(userId)) {
			return userId;
		}
	}
	return currentUser.id;
}

function storageKeys(params: Record<string, unknown>): string[] {
	const keys = params["keys"];
	if (!Array.isArray(keys) || !keys.every(key => typeof key === "string")) {
		throw new FakeHostError(1, 'Parameter "keys" must be an array of strings');
	}
	return keys;
}

function methodResponse(method: string, params: Record<string, unknown>): object {
	switch (method) {
		case "SetSupportedHandlers":
			return { supportedHandlers: [...SUPPORTED_HANDLERS] };
		case "VKWebAppInit":
		case "VKWebAppAddToFavorites":
		case "VKWebAppSetSwipeSettings":
		case "VKWebAppEnableSwipeBack":
		case "VKWebAppDisableSwipeBack":
			return { result: true };
		case "VKWebAppGetConfig":
			return configData();
		case "VKWebAppGetUserInfo": {
			const user = findFakeUser(userIdFromParams(params));
			if (!user) {
				throw new FakeHostError(1, "User not found");
			}
			return toUserInfo(user);
		}
		case "VKWebAppGetFriends":
			return { users: friends.map(toFriendInfo) };
		case "VKWebAppShowInviteBox":
			return { success: true };
		case "VKWebAppShowSlidesSheet":
			return { result: true, action: "confirm" };
		case "VKWebAppShare":
			return { result: [{ type: "post", post_id: `${currentUser.id}_1` }] };
		case "VKWebAppStorageGet":
			return {
				keys: storageKeys(params).map(key => ({ key, value: state.storage[key] ?? "" })),
			};
		case "VKWebAppStorageGetKeys": {
			const offset =
				typeof params["offset"] === "number" && Number.isFinite(params["offset"])
					? Math.max(0, Math.floor(params["offset"]))
					: 0;
			const count =
				typeof params["count"] === "number" && Number.isFinite(params["count"])
					? Math.max(0, Math.floor(params["count"]))
					: 100;
			return { keys: Object.keys(state.storage).slice(offset, offset + count) };
		}
		case "VKWebAppStorageSet": {
			const key = requiredString(params, "key");
			const value = requiredString(params, "value");
			commit({ storage: { ...state.storage, [key]: value } });
			persistStorage();
			return { result: true };
		}
		case "VKWebAppSetLocation": {
			const location = normalizedLocation(requiredString(params, "location"));
			pushLocation(location, params["replace_state"] === true);
			return { result: true };
		}
		default:
			throw new FakeHostError(6, `Method "${method}" is not supported by the fake host`);
	}
}

function parseRequest(value: unknown): VkConnectRequest | undefined {
	if (!isRecord(value) || value["type"] !== "vk-connect") {
		return undefined;
	}
	const handler = value["handler"];
	const params = value["params"];
	if (typeof handler !== "string" || !isRecord(params)) {
		return undefined;
	}
	return { handler, params };
}

function handleWindowResize(): void {
	const viewport = defaultViewport();
	if (viewport.width === state.viewport.width && viewport.height === state.viewport.height) {
		return;
	}
	commit({ viewport });
	emitConfig();
}

function handleMessage(event: MessageEvent): void {
	// Only this app's own vk-connect envelopes are host requests. Responses and
	// unsolicited events have a different shape and pass through untouched.
	if (event.source !== window) {
		return;
	}
	const request = parseRequest(event.data);
	if (!request) {
		return;
	}
	const { handler, params } = request;
	const requestId = requestIdOf(params);
	const outcome = state.outcome;
	window.setTimeout(() => {
		if (outcome !== "success") {
			postResponse(handler, outcomeError(handler, outcome), requestId, true);
			return;
		}
		try {
			postResponse(handler, methodResponse(handler, params), requestId);
		} catch (error) {
			postResponse(handler, clientError(error), requestId, true);
		}
	}, state.latencyMs);
}

/**
 * Install the same-window vk-connect peer. The optional bridge is patched so
 * VKUI treats standalone fake mode as embedded. Repeated calls are harmless.
 */
export function installHost(bridge?: VkmaBridge): void {
	if (bridge) {
		prepareBridgeForHost(bridge);
	}
	if (installed) {
		return;
	}
	installed = true;
	publish();

	if (hostMode !== "fake" || typeof window === "undefined") {
		return;
	}

	window.addEventListener("message", handleMessage);
	window.addEventListener("resize", handleWindowResize);
	if (window.parent !== window) {
		try {
			// This also supports an explicit fake override in a same-origin iframe.
			window.parent.addEventListener("message", handleMessage);
		} catch {
			// A cross-origin parent cannot be instrumented; standalone remains supported.
		}
	}

	window.postMessage({ type: "VKWebAppSettings", frameId: FRAME_ID }, "*");
	emitConfig();
	emitInsets();
}
