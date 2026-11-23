import http from "node:http";
import net from "node:net";
import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createHostRewriter, localhostAliasFor, startForwardProxy } from "./proxy.ts";

/** Raw HTTP request through a loopback socket; resolves the full response text. */
function rawRequest(
	port: number,
	request: string,
	timeoutMs = 3000,
): Promise<{ text: string; closed: boolean }> {
	return new Promise(resolve => {
		let text = "";
		let closed = false;
		const socket = net.connect({ host: "127.0.0.1", port });
		const timer = setTimeout(() => {
			socket.destroy();
			resolve({ text, closed });
		}, timeoutMs);
		timer.unref?.();
		socket.on("connect", () => socket.write(request));
		socket.on("data", (chunk: Buffer) => {
			text += chunk.toString();
		});
		socket.on("close", () => {
			closed = true;
			clearTimeout(timer);
			resolve({ text, closed });
		});
		socket.on("error", () => {
			clearTimeout(timer);
			resolve({ text, closed });
		});
	});
}

describe("localhostAliasFor", () => {
	it("builds a same-length *.localhost alias", () => {
		const alias = localhostAliasFor("m3f2vu5sb237.opentunnel.xyz");
		expect(alias).toBe("m3f2vu5sb237.open.localhost");
		expect(alias?.length).toBe("m3f2vu5sb237.opentunnel.xyz".length);
		expect(alias?.endsWith(".localhost")).toBe(true);
	});

	it("returns undefined for too-short hostnames", () => {
		expect(localhostAliasFor("a.io")).toBeUndefined();
		expect(localhostAliasFor("abc.de")).toBeUndefined();
	});
});

describe("createHostRewriter", () => {
	it("replaces the needle inside a single chunk", () => {
		const rewriter = createHostRewriter("abc.opentunnel.xyz", "abc.open.localhost");
		const text = rewriter
			.write(Buffer.from("Host: abc.opentunnel.xyz\r\n\r\n"))
			.map(piece => piece.toString())
			.join("");
		expect(text).toBe("Host: abc.open.localhost\r\n\r\n");
	});

	it("catches a needle split across chunks", () => {
		const rewriter = createHostRewriter("abc.opentunnel.xyz", "abc.open.localhost");
		const pieces = [
			...rewriter.write(Buffer.from("Host: abc.opentun")),
			...rewriter.write(Buffer.from("nel.xyz\r\n")),
			rewriter.end(),
		];
		const text = pieces.map(piece => piece.toString()).join("");
		expect(text).toBe("Host: abc.open.localhost\r\n");
	});

	it("handles multiple occurrences and preserves surrounding bytes", () => {
		const rewriter = createHostRewriter("opentunnel.xyz", "open.localhost");
		const head =
			"Host: opentunnel.xyz\r\nOrigin: https://opentunnel.xyz\r\nReferer: opentunnel.xyz/x\r\n\r\nbody";
		const pieces = [...rewriter.write(Buffer.from(head)), rewriter.end()];
		const text = pieces.map(piece => piece.toString()).join("");
		expect(text).toBe(
			"Host: open.localhost\r\nOrigin: https://open.localhost\r\nReferer: open.localhost/x\r\n\r\nbody",
		);
	});

	it("releases a partial needle that never completes at flush", () => {
		const rewriter = createHostRewriter("opentunnel.xyz", "open.localhost");
		const pieces = [...rewriter.write(Buffer.from("trailing opentunnel.xy")), rewriter.end()];
		const text = pieces.map(piece => piece.toString()).join("");
		expect(text).toBe("trailing opentunnel.xy");
	});

	it("rejects mismatched lengths", () => {
		expect(() => createHostRewriter("abc", "ab")).toThrow();
	});

	it("holds a suffix that may still complete into the needle, and says so", () => {
		const rewriter = createHostRewriter(
			"abc123def456.opentunnel.xyz",
			"abc123def456.open.localhost",
		);
		// The needle starts with "a": a trailing "a" may be its first byte.
		const text = rewriter
			.write(Buffer.from("count=a"))
			.map(piece => piece.toString())
			.join("");
		expect(text).toBe("count=");
		expect(rewriter.held).toBe(true);
	});

	it("flush() releases the held tail unchanged and re-arms cleanly", () => {
		const rewriter = createHostRewriter(
			"abc123def456.opentunnel.xyz",
			"abc123def456.open.localhost",
		);
		rewriter.write(Buffer.from("count=a"));
		expect(rewriter.flush().toString()).toBe("a");
		expect(rewriter.held).toBe(false);
		// Nothing is left to release when the stream ends.
		expect(rewriter.end().toString()).toBe("");
		// The stream keeps flowing untouched after a flush.
		const after = rewriter
			.write(Buffer.from("bc"))
			.map(piece => piece.toString())
			.join("");
		expect(after).toBe("bc");
		expect(rewriter.held).toBe(false);
	});
});

describe("startForwardProxy", () => {
	const TUNNEL_HOST = "abc123def456.opentunnel.xyz";
	const ALIAS = "abc123def456.open.localhost";

	it("rewrites a split-across-chunks Host and pipes the response", async () => {
		const server = http.createServer((request, response) => {
			response.end(`host-was:${String(request.headers["host"])}`);
		});
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		const { port: targetPort } = server.address() as AddressInfo;
		const proxy = await startForwardProxy({
			targetHost: "127.0.0.1",
			targetPort,
			tunnelHostname: TUNNEL_HOST,
			localhostAlias: ALIAS,
		});
		try {
			const request = `GET / HTTP/1.1\r\nHost: ${TUNNEL_HOST}\r\nConnection: close\r\n\r\n`;
			const result = await rawRequest(proxy.port, request);
			expect(result.text).toContain(`host-was:${ALIAS}`);
		} finally {
			await proxy.close();
			await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});

	it("passes a WebSocket-style upgrade through after rewriting headers", async () => {
		const server = http.createServer((_request, response) => {
			response.end("plain");
		});
		let sawUpgrade = false;
		server.on("upgrade", (request, socket) => {
			sawUpgrade = true;
			expect(request.headers["host"]).toBe(ALIAS);
			socket.end("HTTP/1.1 101 Switching Protocols\r\n\r\n");
		});
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		const { port: targetPort } = server.address() as AddressInfo;
		const proxy = await startForwardProxy({
			targetHost: "127.0.0.1",
			targetPort,
			tunnelHostname: TUNNEL_HOST,
			localhostAlias: ALIAS,
		});
		try {
			const request = [
				"GET / HTTP/1.1",
				`Host: ${TUNNEL_HOST}`,
				"Upgrade: websocket",
				"Connection: Upgrade",
				"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
				"Sec-WebSocket-Version: 13",
				"\r\n",
			].join("\r\n");
			const result = await rawRequest(proxy.port, request);
			expect(sawUpgrade).toBe(true);
			expect(result.text).toContain("101 Switching Protocols");
		} finally {
			await proxy.close();
			server.closeAllConnections();
			await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});

	it("forwards a body whose last byte is a prefix of the tunnel hostname", async () => {
		// The rewriter holds a suffix that may still complete into the
		// hostname. A request body that merely ends in its first byte must
		// not wait forever for bytes that are never coming.
		const server = http.createServer((request, response) => {
			let body = "";
			request.on("data", (chunk: Buffer) => {
				body += chunk.toString();
			});
			request.on("end", () => {
				response.end(`body=<${body}>`);
			});
		});
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		const { port: targetPort } = server.address() as AddressInfo;
		const proxy = await startForwardProxy({
			targetHost: "127.0.0.1",
			targetPort,
			tunnelHostname: TUNNEL_HOST,
			localhostAlias: ALIAS,
		});
		/** One POST with a fixed body and no half-close — exactly what a browser sends. */
		const post = (body: string): Promise<string> =>
			new Promise((resolve, reject) => {
				const request = http.request(
					{
						host: "127.0.0.1",
						port: proxy.port,
						method: "POST",
						headers: {
							host: TUNNEL_HOST,
							"content-length": String(Buffer.byteLength(body)),
						},
					},
					response => {
						let text = "";
						response.on("data", (chunk: Buffer) => {
							text += chunk.toString();
						});
						response.on("end", () => resolve(text));
					},
				);
				// Before the idle flush this hung until the client gave up.
				request.setTimeout(1500, () =>
					request.destroy(new Error("held byte never released")),
				);
				request.on("error", reject);
				request.end(body);
			});
		try {
			// Control: "3" is not a prefix of "abc123def456.opentunnel.xyz".
			expect(await post("count=3")).toBe("body=<count=3>");
			// "a" IS its first byte: the trailing "a" is held, then released.
			expect(await post("count=4&a")).toBe("body=<count=4&a>");
			expect(await post("a")).toBe("body=<a>");
		} finally {
			await proxy.close();
			server.closeAllConnections();
			await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});

	it("fails fast (connection reset) when the target refuses", async () => {
		const proxy = await startForwardProxy({
			targetHost: "127.0.0.1",
			targetPort: 1,
			tunnelHostname: TUNNEL_HOST,
			localhostAlias: ALIAS,
		});
		try {
			const outcome = await new Promise<"reset" | "hang">(resolve => {
				const socket = net.connect({ host: "127.0.0.1", port: proxy.port });
				const timer = setTimeout(() => {
					socket.destroy();
					resolve("hang");
				}, 2000);
				timer.unref?.();
				socket.on("connect", () => {
					socket.write("GET / HTTP/1.1\r\nHost: x\r\n\r\n");
				});
				socket.on("close", () => {
					clearTimeout(timer);
					resolve("reset");
				});
			});
			expect(outcome).toBe("reset");
		} finally {
			await proxy.close();
		}
	});
});
