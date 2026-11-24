/**
 * Local forward proxy with same-length Host rewriting.
 *
 * Vite >= 5.4.12 (dev AND preview) rejects requests whose Host header is
 * not localhost — DNS-rebinding protection. An L4 tunnel (opentunnel is
 * blind TLS) forwards the visitor's Host header untouched, so a
 * CLI-driven tunnel gets "Blocked request" out of the box.
 *
 * HTTP-level tunnels (vk-tunnel, localtunnel) dodge this by rewriting
 * Host to localhost. We do the same — without parsing HTTP: vite also
 * allows every `*.localhost` subdomain, and we can build an alias of the
 * SAME BYTE LENGTH as the tunnel hostname
 * (`m3f2vu5sb237.opentunnel.xyz` → `m3f2vu5sb237.open.localhost`).
 * Same length means the rewrite is a plain byte substitution in the
 * stream: Host, Origin, Referer — every occurrence, no request
 * boundaries, WebSocket upgrades and pipelining pass through untouched.
 *
 * One consequence needs care: a stream suffix that is a PREFIX of the
 * hostname is held back (the needle may be split across chunks), and a
 * held byte must not wait forever. A request body ending in the
 * hostname's first byte, or a masked WebSocket frame whose last byte
 * happens to match it, would otherwise never reach the target in full
 * while the client waits for a response. The proxy therefore releases a
 * held tail after a short idle window (`HOLD_FLUSH_MS`): a split needle
 * arrives within one burst, a request's last byte does not.
 *
 * The proxy is per-tunnel and loopback-only. It fails fast when the real
 * target refuses (the target socket's error destroys the pair); the
 * provider's health watchdog probes the REAL target on its own, so a
 * dead dev server is never mistaken for a wedged relay.
 */

import net from "node:net";

const LOCALHOST_SUFFIX = ".localhost";

/**
 * How long a tail that may still complete into the hostname waits for
 * more bytes before it is forwarded as-is. Requests never sit on it: a
 * GET ends with CRLFCRLF (nothing held), and a held last byte leaves
 * within this window.
 */
export const HOLD_FLUSH_MS = 50;

/**
 * Builds a `*.localhost` hostname with EXACTLY the same byte length as
 * `hostname` (the rewrite is length-preserving by design). Returns
 * undefined when the hostname is too short to hold the suffix — the
 * caller then skips rewriting.
 */
export function localhostAliasFor(hostname: string): string | undefined {
	if (hostname.length <= LOCALHOST_SUFFIX.length) {
		return undefined;
	}
	const alias = hostname.slice(0, hostname.length - LOCALHOST_SUFFIX.length) + LOCALHOST_SUFFIX;
	// Sanity: the alias must still look like a hostname (labels of
	// [a-z0-9-] separated by dots, ending .localhost). The source is a
	// DNS hostname, so slicing can only produce valid label characters.
	if (!/^[a-z0-9][a-z0-9.-]*\.localhost$/.test(alias)) {
		return undefined;
	}
	return alias;
}

export interface HostRewriter {
	/** Rewrites one chunk; returns the (possibly deferred) output. */
	write(chunk: Buffer): Buffer[];
	/** True while a tail is held back because it may still complete into the hostname. */
	readonly held: boolean;
	/**
	 * Releases the held tail UNCHANGED and forgets it — the proxy calls
	 * this once the idle window passes and the needle is no longer
	 * expected to complete.
	 */
	flush(): Buffer;
	/** Flushes the deferred tail (partial match) at stream end. */
	end(): Buffer;
}

/**
 * Streaming fixed-length needle → replacement substitution. Defers a
 * tail of up to `needle.length - 1` bytes so a needle split across TCP
 * chunks is still caught; `end()` releases whatever never matched.
 */
export function createHostRewriter(needle: string, replacement: string): HostRewriter {
	if (needle.length !== replacement.length) {
		throw new Error(`host rewriter requires same-length needle/replacement`);
	}
	let pending = Buffer.alloc(0);
	const release = (): Buffer => {
		const rest = pending;
		pending = Buffer.alloc(0);
		return rest;
	};
	const pattern = Buffer.from(needle, "utf8");
	const swap = Buffer.from(replacement, "utf8");

	return {
		write(chunk: Buffer): Buffer[] {
			const out: Buffer[] = [];
			let buf = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
			// Consumed: the hold logic at the bottom re-arms the tail.
			pending = Buffer.alloc(0);
			let index = buf.indexOf(pattern);
			while (index !== -1) {
				if (index > 0) {
					out.push(buf.subarray(0, index));
				}
				out.push(swap);
				buf = buf.subarray(index + pattern.length);
				index = buf.indexOf(pattern);
			}
			// Hold back only the longest suffix that could still complete
			// into a needle once more bytes arrive — holding a blind tail
			// would swallow bytes that can never match.
			let hold = 0;
			const maxHold = Math.min(pattern.length - 1, buf.length);
			for (let k = maxHold; k > 0; k--) {
				if (pattern.subarray(0, k).equals(buf.subarray(buf.length - k))) {
					hold = k;
					break;
				}
			}
			if (hold > 0) {
				pending = Buffer.from(buf.subarray(buf.length - hold));
				if (buf.length > hold) {
					out.push(buf.subarray(0, buf.length - hold));
				}
			} else if (buf.length > 0) {
				out.push(buf);
			}
			return out;
		},
		get held(): boolean {
			return pending.length > 0;
		},
		flush: release,
		end: release,
	};
}

export interface ForwardProxy {
	readonly port: number;
	close(): Promise<void>;
}

export interface ForwardProxyOptions {
	/** Real target the proxy forwards to (after rewriting). */
	readonly targetHost: string;
	readonly targetPort: number;
	/** The tunnel hostname (needle) and its same-length localhost alias. */
	readonly tunnelHostname: string;
	readonly localhostAlias: string;
}

/** Spawns the loopback rewriting proxy. Resolves once it listens. */
export function startForwardProxy(options: ForwardProxyOptions): Promise<ForwardProxy> {
	const rewriterFactory = (): HostRewriter =>
		createHostRewriter(options.tunnelHostname, options.localhostAlias);

	// Tracked manually: @types/node's net.Server lacks closeAllConnections.
	const sockets = new Set<net.Socket>();

	const server = net.createServer(clientSocket => {
		const rewriter = rewriterFactory();
		const targetSocket = net.connect({
			host: options.targetHost,
			port: options.targetPort,
		});
		sockets.add(clientSocket);
		sockets.add(targetSocket);
		const forget = (): void => {
			sockets.delete(clientSocket);
			sockets.delete(targetSocket);
		};

		// Idle flush: a tail held as a possible needle prefix is released
		// once no more bytes arrive within HOLD_FLUSH_MS — a request's
		// last byte must not wait for data that is never coming.
		let holdTimer: ReturnType<typeof setTimeout> | undefined;
		const cancelHold = (): void => {
			if (holdTimer !== undefined) {
				clearTimeout(holdTimer);
				holdTimer = undefined;
			}
		};
		const releaseHold = (): void => {
			cancelHold();
			if (rewriter.held) {
				targetSocket.write(rewriter.flush());
			}
		};

		const destroy = (): void => {
			clientSocket.destroy();
			targetSocket.destroy();
		};
		clientSocket.once("error", destroy);
		targetSocket.once("error", destroy);
		clientSocket.once("close", () => {
			cancelHold();
			forget();
			targetSocket.destroy();
		});
		targetSocket.once("close", () => {
			cancelHold();
			forget();
			clientSocket.destroy();
		});

		// Tunnel → target: rewrite every occurrence of the tunnel hostname
		// (Host, Origin, Referer, …) into its localhost alias.
		clientSocket.on("data", (chunk: Buffer) => {
			// More bytes: a held tail joins them instead of being released.
			cancelHold();
			for (const piece of rewriter.write(chunk)) {
				targetSocket.write(piece);
			}
			if (rewriter.held) {
				holdTimer = setTimeout(releaseHold, HOLD_FLUSH_MS);
				holdTimer.unref?.();
			}
		});
		clientSocket.once("end", () => {
			cancelHold();
			targetSocket.write(rewriter.end());
			targetSocket.end();
		});
		// Target → tunnel: responses pass through untouched.
		targetSocket.on("data", (chunk: Buffer) => {
			clientSocket.write(chunk);
		});
		targetSocket.once("end", () => clientSocket.end());
	});

	return new Promise<ForwardProxy>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address !== null ? address.port : 0;
			resolve({
				port,
				close: () =>
					new Promise<void>(resolveClose => {
						server.close(() => resolveClose());
						// Drop live connections: the tunnel is going away with us.
						for (const socket of sockets) {
							socket.destroy();
						}
					}),
			});
		});
	});
}
