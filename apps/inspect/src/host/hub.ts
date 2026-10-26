/**
 * A minimal broadcast hub for the in-process panel: subscribers get every
 * published value (copied verbatim from the extension host — there the
 * same class feeds werpc subscription generators; here React hooks).
 */
export class Hub<T> {
	private readonly subscribers = new Set<(value: T) => void>();

	public subscribe(listener: (value: T) => void): () => void {
		this.subscribers.add(listener);
		return () => {
			this.subscribers.delete(listener);
		};
	}

	public publish(value: T): void {
		for (const listener of this.subscribers) {
			listener(value);
		}
	}
}

/**
 * Coalesces pushes into batches flushed on a short timer — a chatty mini
 * app would otherwise re-render the panel per event.
 */
export class BatchedHub<T> {
	private readonly hub = new Hub<T[]>();
	private queue: T[] = [];
	private timer: ReturnType<typeof setTimeout> | undefined;

	public constructor(private readonly flushMs: number) {}

	public subscribe(listener: (value: T[]) => void): () => void {
		return this.hub.subscribe(listener);
	}

	public push(value: T): void {
		this.queue.push(value);
		this.schedule();
	}

	public pushMany(values: readonly T[]): void {
		if (values.length === 0) {
			return;
		}
		this.queue.push(...values);
		this.schedule();
	}

	private schedule(): void {
		if (this.timer === undefined) {
			this.timer = setTimeout(() => {
				this.timer = undefined;
				this.flush();
			}, this.flushMs);
		}
	}

	public flush(): void {
		if (this.queue.length === 0) {
			return;
		}
		const batch = this.queue;
		this.queue = [];
		this.hub.publish(batch);
	}
}
