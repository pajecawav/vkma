/**
 * Redux-style middleware over `send`: compose logging, metrics or caching
 * around the dispatch without touching the transport.
 */

import type { VKBridge, VKBridgeSend, VKBridgeSubscribeHandler } from "./types.ts";

/**
 * API that can use middleware.
 */
export interface MiddlewareAPI<
	S extends VKBridgeSend = VKBridgeSend,
	L extends VKBridgeSubscribeHandler = VKBridgeSubscribeHandler,
> {
	send: S;
	subscribe(listener: L): void;
}

/**
 * A middleware is a higher-order function that composes a dispatch function
 * to return a new `send` function.
 */
export type Middleware<S extends VKBridgeSend = VKBridgeSend> = (
	api: MiddlewareAPI<S>,
) => (next: S) => S;

/**
 * Creates the VK Bridge enhancer that applies middleware to the `send`
 * method. This is handy for a variety of tasks such as logging every sent
 * event.
 *
 * @param middlewares The middleware chain to be applied.
 * @returns The VK Bridge enhancer applying the middleware.
 */
export function applyMiddleware(
	...middlewares: Array<Middleware | undefined | null>
): (bridge: VKBridge) => VKBridge {
	if (middlewares.includes(undefined) || middlewares.includes(null)) {
		return applyMiddleware(
			...middlewares.filter((item): item is Middleware => typeof item === "function"),
		);
	}

	return bridge => {
		if (middlewares.length === 0) {
			return bridge;
		}

		let send: VKBridgeSend = () => {
			throw new Error(
				"Sending events while constructing your middleware is not allowed. " +
					"Other middleware would not be applied to this send.",
			);
		};

		const middlewareAPI: MiddlewareAPI = {
			subscribe: bridge.subscribe,
			send: ((...args: Parameters<VKBridgeSend>) => bridge.send(...args)) as VKBridgeSend,
		};

		const chain = middlewares
			.filter((item): item is Middleware => typeof item === "function")
			.map(middleware => middleware(middlewareAPI))
			.reduce((a, b) => next => a(b(next)));

		send = chain(bridge.send);

		return { ...bridge, send };
	};
}
