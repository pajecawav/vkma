/**
 * Zod schemas for the extension's trust boundaries. Every place where
 * data crosses from a page world into extension code is parsed here and
 * anything invalid is dropped silently (like the collector drops
 * `vk-connect` transport chatter): the top-frame sniffer's window
 * messages, the MAIN-world relay's window messages, and the werpc
 * procedure inputs.
 */
import { z } from "zod";
import { RELAY_CHANNEL } from "./index.ts";

/** A tap event before the collecting side stamps `seq`/`clientId`.
 * `ts` must be a finite millisecond timestamp inside the ECMAScript date
 * range. Anything else is malformed foreign input and drops silently
 * (one out-of-range value must never reach a `new Date(ts)` render sink). */
export const tapEventSchema = z.object({
	/** Monotonic within a page load; pairs a `response` with its `send`. */
	id: z.number(),
	ts: z.number().refine(ts => Number.isInteger(ts) && ts >= 0 && ts <= 8.64e15, {
		message: "ts out of range",
	}),
	direction: z.enum(["out", "in"]),
	kind: z.enum(["send", "response", "event"]),
	name: z.string().max(512),
	payload: z.unknown().optional(),
	reqId: z.number().optional(),
	ok: z.boolean().optional(),
});
export type TapEvent = z.infer<typeof tapEventSchema>;

/** The vk-connect envelope the web transport posts to the host frame. */
export const vkConnectEnvelopeSchema = z.object({
	type: z.literal("vk-connect"),
	handler: z.string(),
	params: z.record(z.string(), z.unknown()),
	webFrameId: z.string().optional(),
	connectVersion: z.string().optional(),
});
export type VkConnectEnvelope = z.infer<typeof vkConnectEnvelopeSchema>;

/** True for anything shaped like a vk-connect envelope (cheap pre-filter). */
export function looksLikeVkConnect(data: unknown): data is object {
	return (
		typeof data === "object" &&
		data !== null &&
		"type" in data &&
		(data as { type?: unknown }).type === "vk-connect"
	);
}

/** The launch-params subset a mini app frame reports on hello. */
export const launchParamsSchema = z
	.record(z.string().max(128), z.string().max(2048))
	.refine(params => Object.keys(params).length <= 128, {
		message: "too many launch params",
	});

export const clientInfoSchema = z.object({
	clientId: z.string().max(256),
	sessionId: z.string().max(256),
	connectedAt: z.number(),
	lastSeenAt: z.number(),
	ua: z.string().max(512),
	url: z.string().max(8192),
	platform: z.string().max(128),
	bridge: z.boolean(),
	appId: z.string().max(64).optional(),
	launchParams: launchParamsSchema.optional(),
});
export type HelloClientInfo = z.infer<typeof clientInfoSchema>;

export const executeInputSchema = z.object({
	clientId: z.string(),
	name: z.string(),
	params: z.record(z.string(), z.unknown()).optional(),
});
export type ExecuteInput = z.infer<typeof executeInputSchema>;

/**
 * The MAIN-world relay's window.postMessage payloads. `__vkmaExt` is the
 * reserved channel name (constant in the zod-free package root. The
 * relay itself must not depend on zod); `kind` selects the shape.
 */
export { RELAY_CHANNEL } from "./index.ts";

export const relayEventMessageSchema = z.object({
	channel: z.literal(RELAY_CHANNEL),
	kind: z.literal("event"),
	event: tapEventSchema,
});
/** Direct-connect availability announcement (once per relay init). */
export const relayHelloMessageSchema = z.object({
	channel: z.literal(RELAY_CHANNEL),
	kind: z.literal("hello"),
	found: z.boolean(),
});
/** Frame collector → relay: execute a send on the app's own bridge. */
export const relaySendRequestSchema = z.object({
	channel: z.literal(RELAY_CHANNEL),
	kind: z.literal("send"),
	execId: z.number(),
	name: z.string(),
	params: z.record(z.string(), z.unknown()).optional(),
});
/** Relay → frame collector: the settled result of a `send`. */
export const relaySendResultSchema = z.object({
	channel: z.literal(RELAY_CHANNEL),
	kind: z.literal("send-result"),
	execId: z.number(),
	ok: z.boolean(),
	payload: z.unknown().optional(),
});
