/**
 * Pure tap machinery: a tiny fan-out hub with a bounded replay buffer,
 * detached from vk-bridge so it is unit-testable and tree-shakeable.
 *
 * The bridge wrapper always emits into the tap. When no devtools collector
 * is attached (production), the buffer fills up once and every later emit
 * costs a dropped-head push, effectively free.
 */

export interface BridgeTapEvent {
	/** Monotonic within a page load; pairs a `response` with its `send`. */
	id: number;
	ts: number;
	/** `out`, the app called send; `in`, VK sent something to the app. */
	direction: "out" | "in";
	/** `send` (out), `response` (in, paired), `event` (in, unsolicited). */
	kind: "send" | "response" | "event";
	name: string;
	payload?: unknown;
	/** Response pairing: the id of the originating `send` event. */
	reqId?: number;
	/** Only for `response`: whether the promise resolved or rejected. */
	ok?: boolean;
}

export interface BridgeTap {
	emit(event: Omit<BridgeTapEvent, "id" | "ts"> & { ts?: number }): number;
	subscribe(listener: (event: BridgeTapEvent) => void): () => void;
	/** Events buffered before the first subscriber attached, oldest first. */
	drain(): BridgeTapEvent[];
}

const DEFAULT_BUFFER_LIMIT = 500;

export function createTap(limit: number = DEFAULT_BUFFER_LIMIT): BridgeTap {
	let nextId = 0;
	let buffer: BridgeTapEvent[] | undefined = [];
	const listeners = new Set<(event: BridgeTapEvent) => void>();

	return {
		emit(partial) {
			const event: BridgeTapEvent = {
				...partial,
				id: ++nextId,
				ts: partial.ts ?? Date.now(),
			};
			if (listeners.size === 0) {
				// No collector yet (production or devtools not loaded): keep a
				// bounded replay so a late-attaching collector still sees recent
				// history, then stop growing work at the cap.
				if (buffer && buffer.length >= limit) {
					buffer.shift();
				}
				buffer?.push(event);
				return event.id;
			}
			for (const listener of listeners) {
				listener(event);
			}
			return event.id;
		},
		subscribe(listener) {
			listeners.add(listener);
			const replay = buffer ?? [];
			buffer = undefined;
			for (const event of replay) {
				listener(event);
			}
			return () => {
				listeners.delete(listener);
			};
		},
		drain() {
			return buffer ? [...buffer] : [];
		},
	};
}
