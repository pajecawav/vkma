/**
 * A minimal broadcast hub for werpc subscription generators: subscribers
 * get every published value; a generator awaits the next push when its
 * queue is empty. (devframe's streaming channels are the devtools node
 * side's equivalent.)
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
 * Coalesces pushes into batches flushed on a short timer; a chatty mini
 * app would otherwise wake every panel surface per event.
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
