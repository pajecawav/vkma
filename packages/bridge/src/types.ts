/**
 * Bridge machinery types, built on top of the @vkma.dev/bridge-schema
 * catalogue. The payload types and the three catalogue maps
 * (`RequestPropsMap` / `ReceiveDataMap` / `ReceiveEventMap`) are re-exported
 * from the schema package by the public entrypoint; everything here is the
 * send/subscribe/event plumbing around them.
 */

import type { ReceiveDataMap, ReceiveEventMap, RequestPropsMap } from "@vkma.dev/bridge-schema";
import type { BridgeTap, BridgeTapEvent } from "./tap.ts";

/**
 * Name of a method that can be sent.
 */
export type AnyRequestMethodName = keyof RequestPropsMap;

/**
 * Name of a method that can be received.
 */
export type AnyReceiveMethodName = keyof ReceiveDataMap;

/**
 * Name of a method that can be only sent.
 */
export type AnyRequestOnlyMethodName = Exclude<AnyRequestMethodName, AnyReceiveMethodName>;

/**
 * Name of a method that can be only received.
 */
export type AnyReceiveOnlyMethodName = Exclude<AnyReceiveMethodName, AnyRequestMethodName>;

/**
 * Type of any method name.
 */
export type AnyMethodName = AnyRequestMethodName | AnyReceiveMethodName;

/**
 * The name of the method that can be both sent and received.
 */
export type AnyIOMethodName = AnyRequestMethodName & AnyReceiveMethodName;

/**
 * Getter of request properties of a method.
 */
export type RequestProps<M extends AnyRequestMethodName = AnyRequestMethodName> =
	RequestPropsMap[M];

/**
 * Getter of response data of a method.
 */
export type ReceiveData<M extends AnyReceiveMethodName> = ReceiveDataMap[M];

/**
 * Property for matching a sent request with the received message.
 */
export type RequestIdProp = { request_id?: number | string };

/**
 * Extra per-send controls on top of the classic two-argument call.
 */
export interface SendOptions {
	/** Reject the promise if no response arrives within this many milliseconds. */
	timeout?: number;
	/** Reject the promise when the signal aborts. */
	signal?: AbortSignal;
}

/**
 * Type of send function for methods that have props.
 *
 * @param method The method (event) name to send.
 * @param props Method properties.
 * @param options Timeout / abort controls.
 * @returns The Promise object with response data.
 */
export type VKBridgeSend = <K extends AnyRequestMethodName>(
	method: K,
	props?: RequestProps<K> & RequestIdProp,
	options?: SendOptions,
) => Promise<K extends AnyReceiveMethodName ? ReceiveData<K> : void>;

/**
 * Name of the Result response event of a method (per the catalogue wiring).
 */
export type ResultResponseEventName<M extends AnyRequestMethodName> =
	M extends keyof ReceiveEventMap ? ReceiveEventMap[M]["result"] : never;

/**
 * Name of the Failed response event of a method (per the catalogue wiring).
 */
export type FailedResponseEventName<M extends AnyRequestMethodName> =
	M extends keyof ReceiveEventMap ? ReceiveEventMap[M]["failed"] : never;

/**
 * Client error data.
 */
export type ErrorDataClientError = {
	error_code: number;
	error_reason: string;
	error_description?: string;
};

/**
 * API error data.
 */
export type ErrorDataAPIError = {
	error_code: number;
	error_msg: string;
	request_params: string[];
};

/**
 * Auth error data.
 */
export type ErrorDataAuthError = {
	error_code: number;
	error_reason: string;
	error_description?: string[];
};

/**
 * Error data of a Failed response event.
 */
export type ErrorData =
	| {
			error_type: "client_error";
			error_data: ErrorDataClientError;
			request_id?: number | string;
	  }
	| {
			error_type: "api_error";
			error_data: ErrorDataAPIError;
			request_id?: number | string;
	  }
	| {
			error_type: "auth_error";
			error_data: ErrorDataAuthError;
			request_id?: number | string;
	  };

/**
 * Generic event type for creating event types.
 */
export type VKBridgeEventBase<Type extends string, Data> = {
	detail: {
		type: Type;
		data: Data;
	};
};

/**
 * Type of error event data.
 */
export type VKBridgeErrorEvent<M extends AnyReceiveMethodName> = VKBridgeEventBase<
	M extends AnyRequestMethodName ? FailedResponseEventName<M> : never,
	ErrorData
>;

/**
 * Type of event that is a response to a request.
 */
export type VKBridgeIOEvent<M extends AnyIOMethodName> = {
	[K in M]: VKBridgeEventBase<ResultResponseEventName<K>, ReceiveData<K> & RequestIdProp>;
}[M];

/**
 * Type of event that is not a response to a request.
 */
export type VKBridgeReceiveOnlyEvent<M extends AnyReceiveOnlyMethodName> = {
	[K in M]: VKBridgeEventBase<K, ReceiveData<K>>;
}[M];

/**
 * Type of result event data.
 */
export type VKBridgeResultEvent<M extends AnyReceiveMethodName> = M extends AnyReceiveOnlyMethodName
	? VKBridgeReceiveOnlyEvent<M>
	: M extends AnyIOMethodName
		? VKBridgeIOEvent<M>
		: never;

/**
 * VK Bridge event.
 */
export type VKBridgeEvent<M extends AnyReceiveMethodName> =
	| VKBridgeErrorEvent<M>
	| VKBridgeResultEvent<M>;

/**
 * Type of function that can be subscribed to VK Bridge events.
 */
export type VKBridgeSubscribeHandler = (event: VKBridgeEvent<AnyReceiveMethodName>) => void;

/**
 * VK Bridge interface — the classic drop-in surface.
 */
export interface VKBridge {
	/**
	 * Sends an event to the runtime env and returns the Promise object with
	 * response data. In the case of Android/iOS application env is the
	 * application itself. In the case of the browser, the parent frame in
	 * which the event handlers is located.
	 *
	 * @param method The method (event) name to send.
	 * @param [props] Method properties.
	 * @param [options] Timeout / abort controls.
	 * @returns The Promise object with response data.
	 */
	send: VKBridgeSend;

	/**
	 * @alias send
	 * @deprecated
	 */
	sendPromise: VKBridgeSend;

	/**
	 * Adds an event listener. It will be called any time a data is received.
	 *
	 * @param listener A callback to be invoked on every event receive.
	 */
	subscribe: (listener: VKBridgeSubscribeHandler) => void;

	/**
	 * Removes an event listener which has been subscribed for event listening.
	 *
	 * @param listener A callback to unsubscribe.
	 */
	unsubscribe: (listener: VKBridgeSubscribeHandler) => void;

	/**
	 * Checks if a method is supported on runtime platform.
	 *
	 * @param method Method (event) name to check.
	 * @returns Result of checking.
	 * @deprecated This method is deprecated. Use supportsAsync instead.
	 */
	supports: <K extends AnyRequestMethodName>(method: K) => boolean;

	/**
	 * Checks if a method is supported on runtime platform.
	 *
	 * @param method Method (event) name to check.
	 * @returns The Promise object with result of checking.
	 */
	supportsAsync: <K extends AnyRequestMethodName>(method: K) => Promise<boolean>;

	/**
	 * Checks whether the runtime is a WebView.
	 */
	isWebView: () => boolean;

	isIframe: () => boolean;

	isEmbedded: () => boolean;

	isStandalone: () => boolean;
}

/**
 * The full instance surface: the classic VK Bridge plus the always-on tap
 * and its subscription helpers.
 */
export interface VkmaBridge extends VKBridge {
	/** The replay-buffered stream of sends, paired responses and events. */
	tap: BridgeTap;
	/** Subscribe to outgoing `send` calls. */
	onSend: (listener: (event: BridgeTapEvent & { direction: "out" }) => void) => () => void;
	/** Subscribe to everything incoming: paired responses and unsolicited events. */
	onEvent: (listener: (event: BridgeTapEvent & { direction: "in" }) => void) => () => void;
}
