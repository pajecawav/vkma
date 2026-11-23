/**
 * HTTP probes shared by the providers' health logic.
 *
 * Two questions, deliberately separate:
 * - `probeHttp`: did ANYTHING answer? (opentunnel's watchdog — there, the
 *   tunnel itself is the only thing that can answer, so any status is
 *   proof the whole chain is up);
 * - `httpStatus`: WHAT answered? (cloudflared's gate and watchdog — there
 *   the Cloudflare edge answers with `530` even when the tunnel behind it
 *   is dead, so the status is the signal).
 */

/** Direct-target probe deadline (the watchdog baseline). */
export const DIRECT_PROBE_TIMEOUT_MS = 5_000;

/**
 * HEAD probe with a deadline: the HTTP status code, or undefined when
 * nothing answered at all (timeout, connection refused, TLS reset).
 */
export async function httpStatus(
	url: string,
	timeoutMs: number,
	init: { readonly method?: "HEAD" | "GET" } = {},
): Promise<number | undefined> {
	try {
		const response = await fetch(url, {
			method: init.method ?? "HEAD",
			signal: AbortSignal.timeout(timeoutMs),
			redirect: "manual",
		});
		response.body?.cancel().catch(() => undefined);
		return response.status;
	} catch {
		return undefined;
	}
}

/**
 * Any HTTP response counts as alive (4xx/5xx included — presence of a
 * reply is the signal, not the code).
 */
export async function probeHttp(
	url: string,
	timeoutMs = DIRECT_PROBE_TIMEOUT_MS,
): Promise<boolean> {
	return (await httpStatus(url, timeoutMs)) !== undefined;
}
