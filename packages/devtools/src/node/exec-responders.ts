/**
 * Which RPC session registered a client (the session meta the hello
 * arrived from). Execute results settle only for that session: the
 * `clientExecute` broadcast carries the execId to EVERY collector, so
 * the id alone proves nothing: without this binding, any connected
 * page could forge the answer to a pending execute, including one an
 * MCP agent is waiting on.
 */
export class ExecResponders {
	readonly #byClient = new Map<string, unknown>();

	/** The hello's session becomes the only legitimate responder for
	 * the client (a later hello from a fresh session re-binds: the
	 * page reloaded, the old session is dead anyway). */
	public bind(meta: unknown, clientId: string): void {
		this.#byClient.set(clientId, meta);
	}

	/** The owner a pending execute is bound to (undefined = nobody has
	 * registered the client; results will not settle, by design). */
	public responderOf(clientId: string): unknown {
		return this.#byClient.get(clientId);
	}

	/** Drop bindings for clients that left the registry (bounded map). */
	public prune(has: (clientId: string) => boolean): void {
		// Map iteration tolerates deleting the current key: no copy needed
		for (const id of this.#byClient.keys()) {
			if (!has(id)) {
				this.#byClient.delete(id);
			}
		}
	}
}
