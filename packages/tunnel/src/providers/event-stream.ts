/**
 * The merged event stream every provider hands to the core: one
 * AsyncIterable fed by `push`, mirrored to the caller's `onEvent`, ending
 * once `end()` was called and the queue is drained.
 *
 * Until something iterates, only a bounded tail is kept: the CLI and the
 * plugin drive `onEvent` alone, and every visitor connection adds events,
 * so an unbounded queue would grow for as long as the process lives.
 */

import type { TunnelEvent } from "../core/types.ts";

/**
 * Events kept for a consumer that has not started iterating `events`
 * yet. The oldest are dropped first; once a consumer iterates, nothing
 * is dropped any more.
 */
export const PRE_STREAM_EVENT_TAIL = 256;

export interface EventStream {
	/** Queues one event, mirrors it to `onEvent` and wakes the iterator. */
	push(event: TunnelEvent): void;
	/** The tunnel is over: the iterable ends once the queued events are drained. */
	end(): void;
	readonly iterable: AsyncIterable<TunnelEvent>;
}

export function createEventStream(
	onEvent: ((event: TunnelEvent) => void) | undefined,
	tail = PRE_STREAM_EVENT_TAIL,
): EventStream {
	const queue: TunnelEvent[] = [];
	let notify: (() => void) | undefined;
	let streaming = false;
	let finished = false;
	const wake = (): void => {
		const pending = notify;
		notify = undefined;
		pending?.();
	};

	async function* merged(): AsyncGenerator<TunnelEvent> {
		streaming = true;
		try {
			for (;;) {
				while (queue.length > 0) {
					yield queue.shift() as TunnelEvent;
				}
				if (finished) {
					return;
				}
				await new Promise<void>(resolve => {
					notify = resolve;
				});
			}
		} finally {
			// Left early (`break`) or drained to the end: back to the bounded tail.
			streaming = false;
		}
	}

	return {
		push(event) {
			queue.push(event);
			if (!streaming && queue.length > tail) {
				queue.shift();
			}
			onEvent?.(event);
			wake();
		},
		end() {
			finished = true;
			wake();
		},
		iterable: merged(),
	};
}
