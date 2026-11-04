/**
 * PROTOTYPE (spike 3). Fake VK host playing the bridge contract:
 * `VKWebAppSetLocation` in (replace_state semantics), `VKWebAppChangeFragment`
 * out when the host-side history moves (its "back" button).
 */

export interface BridgeEvent {
	type: string;
	data?: unknown;
}

export function createFakeBridge() {
	const listeners = new Set<(event: BridgeEvent) => void>();
	const sent: Array<{ type: string; data: unknown }> = [];
	/** host-side location stack; replace_state:true replaces the top entry */
	const hostStack: string[] = [];
	const notify = () => {
		for (const listener of listeners) {
			listener({ type: "__hostUpdated" });
		}
	};

	return {
		sent,
		hostStack,
		send(type: string, data?: unknown): Promise<unknown> {
			sent.push({ type, data });
			if (type === "VKWebAppSetLocation") {
				const { location, replace_state } = data as {
					location: string;
					replace_state?: boolean;
				};
				// first location seeds the stack (the host opened the app here);
				// after that replace_state semantics apply
				if (hostStack.length === 0 || !replace_state) {
					hostStack.push(location);
				} else {
					hostStack[hostStack.length - 1] = location;
				}
				notify();
			}
			return Promise.resolve({ result: true });
		},
		subscribe(listener: (event: BridgeEvent) => void): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * The host navigates the app itself (notification link, native UI):
		 * emits ChangeFragment with the given hash payload.
		 */
		hostJump(location: string): void {
			for (const listener of listeners) {
				listener({ type: "VKWebAppChangeFragment", data: { location } });
			}
			notify();
		},
	};
}

export const fakeBridge = createFakeBridge();
