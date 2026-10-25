/**
 * The structural bridge contract: type-compatible with both
 * `@vkontakte/vk-bridge` (whose subscribe handlers receive
 * `{ detail: { type, data } }` CustomEvents) and `@vkma.dev/bridge`
 * (flat `{ type, data }`). The router never hard-depends on either.
 */

export interface BridgeEventEnvelope {
	type?: string;
	data?: unknown;
	detail?: { type?: string; data?: unknown };
}

export interface VkBridgeLike {
	send(method: string, params?: Record<string, unknown>): Promise<unknown>;
	subscribe(handler: (event: BridgeEventEnvelope) => void): () => void;
}

export function normalizeBridgeEvent(
	event: BridgeEventEnvelope,
): { type: string; data: unknown } | null {
	const type = event.detail?.type ?? event.type;
	const data = event.detail !== undefined ? event.detail.data : event.data;
	return type !== undefined ? { type, data } : null;
}
