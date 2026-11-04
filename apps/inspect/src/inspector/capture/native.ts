/**
 * Native bridge interception, the vk-mini-app-spy webview lesson,
 * hardened for a third-party page:
 *
 * FORWARD-THEN-TAP. Every wrapper runs the original native handler
 * first and reports afterwards. The page must behave exactly as if the
 * inspector were never there.
 *
 * TWO VISIBILITY LEVELS. vk-bridge (and every bridge clone) captures
 * `window.AndroidBridge` / `window.webkit.messageHandlers` as module
 * constants AT IMPORT. To be seen by both an already-imported bridge
 * (console import(), late script tag) and every later reader we (a)
 * wrap the methods IN PLACE on the original object and (b) replace the
 * window property with a Proxy that lazily wraps methods the native
 * side adds later.
 */

interface NativeCall {
	name: string;
	params: Record<string, unknown>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isWrappableName = (name: string): boolean =>
	name !== "constructor" && name !== "__proto__" && !name.startsWith("__");

export function installNativeCapture(onCall: (call: NativeCall) => void): boolean {
	let installed = false;
	installed = wrapAndroidBridge(onCall) || installed;
	installed = wrapIosBridge(onCall) || installed;
	return installed;
}

/** Android: `AndroidBridge[VKWebAppEvent](jsonString)`, params arrive
 * JSON-stringified; the method NAME is the bridge event name. */
function wrapAndroidBridge(onCall: (call: NativeCall) => void): boolean {
	const w = window as typeof window & { AndroidBridge?: unknown };
	const bridge = w.AndroidBridge;
	if (typeof bridge !== "object" || bridge === null) {
		return false;
	}
	const target = bridge as Record<string, unknown>;
	const wrapped = new Set<string>();

	const report = (name: string, serialized: string): void => {
		let params: unknown;
		try {
			params = JSON.parse(serialized);
		} catch {
			return; // not JSON, not bridge traffic
		}
		if (isPlainObject(params)) {
			onCall({ name, params });
		}
	};

	const wrapInPlace = (name: string): void => {
		if (wrapped.has(name) || !isWrappableName(name)) {
			return;
		}
		const original = target[name];
		if (typeof original !== "function") {
			return;
		}
		try {
			target[name] = (serialized: string) => {
				const result = (original as (data: string) => unknown).apply(target, [serialized]);
				report(name, serialized);
				return result;
			};
			wrapped.add(name);
		} catch {
			// non-writable native surface, fresh readers still get the proxy
		}
	};

	for (const name of Object.getOwnPropertyNames(target)) {
		wrapInPlace(name);
	}
	w.AndroidBridge = new Proxy(target, {
		get(obj, prop) {
			if (typeof prop === "string") {
				wrapInPlace(prop);
			}
			return Reflect.get(obj, prop);
		},
	});
	return true;
}

/** iOS: `webkit.messageHandlers[VKWebAppEvent].postMessage(paramsObject)`
 * params arrive as objects; vk-bridge's webview detection needs
 * `VKWebAppClose` to stay reachable, so handler objects keep their
 * shape (only `postMessage` answers through a proxy). */
function wrapIosBridge(onCall: (call: NativeCall) => void): boolean {
	const w = window as typeof window & {
		webkit?: { messageHandlers?: unknown };
	};
	const webkit = w.webkit;
	const handlers = webkit?.messageHandlers;
	if (typeof handlers !== "object" || handlers === null) {
		return false;
	}
	const collection = handlers as Record<string, unknown>;
	const wrapped = new Set<string>();

	const wrapHandler = (name: string): void => {
		if (wrapped.has(name) || !isWrappableName(name)) {
			return;
		}
		const handler = collection[name];
		if (typeof handler !== "object" || handler === null) {
			return;
		}
		const original = (handler as { postMessage?: unknown }).postMessage;
		if (typeof original !== "function") {
			return;
		}
		const proxy = new Proxy(handler, {
			get(obj, prop, receiver) {
				if (prop === "postMessage") {
					return (data: unknown) => {
						const result = (original as (payload: unknown) => unknown).apply(obj, [
							data,
						]);
						if (isPlainObject(data)) {
							onCall({ name, params: data });
						}
						return result;
					};
				}
				return Reflect.get(obj, prop, receiver);
			},
		});
		try {
			collection[name] = proxy;
			wrapped.add(name);
		} catch {
			// the collection rejects writes, fresh readers still get the proxy
		}
	};

	for (const name of Object.getOwnPropertyNames(collection)) {
		wrapHandler(name);
	}
	if (webkit !== undefined) {
		webkit.messageHandlers = new Proxy(collection, {
			get(obj, prop) {
				if (typeof prop === "string") {
					wrapHandler(prop);
				}
				return Reflect.get(obj, prop);
			},
		});
	}
	return true;
}
