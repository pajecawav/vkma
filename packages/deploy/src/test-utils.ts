/**
 * Test-only fetch mocks. Consumes stream bodies so upload progress fires.
 */

import type { FetchLike } from "./api/client.ts";

export interface MockResponseSpec {
	readonly status?: number;
	readonly body: string | Record<string, unknown>;
	readonly headers?: Record<string, string>;
}

export interface RecordedCall {
	readonly url: string;
	readonly init: RequestInit | undefined;
	readonly bodyBytes: Uint8Array | undefined;
}

export interface FetchSpy {
	readonly fetchImpl: FetchLike;
	readonly calls: RecordedCall[];
}

export function createFetchSpy(
	handler: (
		url: string,
		init: RequestInit | undefined,
	) => MockResponseSpec | Promise<MockResponseSpec>,
): FetchSpy {
	const calls: RecordedCall[] = [];
	const fetchImpl: FetchLike = async (url, init) => {
		let bodyBytes: Uint8Array | undefined;
		if (init?.body instanceof ReadableStream) {
			const buffer = await new Response(init.body).arrayBuffer();
			bodyBytes = new Uint8Array(buffer);
		} else if (init?.body instanceof Uint8Array) {
			bodyBytes = init.body;
		}
		calls.push({ url, init, bodyBytes });
		const spec = await handler(url, init);
		const bodyText = typeof spec.body === "string" ? spec.body : JSON.stringify(spec.body);
		return new Response(bodyText, { status: spec.status ?? 200, headers: spec.headers });
	};
	return { fetchImpl, calls };
}

/** Handler that pops queued responses in order. */
export function sequence(...specs: MockResponseSpec[]): (url: string) => MockResponseSpec {
	let index = 0;
	return () => {
		const spec = specs[index];
		index += 1;
		if (spec === undefined) {
			throw new Error(
				`Mock fetch exhausted after ${specs.length} responses (call #${index})`,
			);
		}
		return spec;
	};
}

/** Handler routing by substring match. */
export function route(
	routes: [match: string, responder: () => MockResponseSpec][],
): (url: string) => MockResponseSpec {
	return url => {
		for (const [match, responder] of routes) {
			if (url.includes(match)) {
				return responder();
			}
		}
		throw new Error(`No mock route matched: ${url}`);
	};
}

export const instantSleep = async (): Promise<void> => {};
