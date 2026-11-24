/**
 * HTTP probes shared by the providers' health logic.
 *
 * Two questions, deliberately separate:
 * - `probeHttp`: did ANYTHING answer? (opentunnel's watchdog — there, the
 *   tunnel itself is the only thing that can answer, so any status is
 *   proof the whole chain is up);
 * - `httpStatus`: WHAT answered? (cloudflared's gate and watchdog — there
 *   the Cloudflare edge answers with `530` even when the tunnel behind it
 *   is dead, so the status is the signal, and `CLOUDFLARE_ERROR_STATUS` is
 *   the line between down and up. The CLI's `status` reads a cloudflared
 *   profile by the same line).
 */

/** Direct-target probe deadline (the watchdog baseline). */
export const DIRECT_PROBE_TIMEOUT_MS = 5_000;

/**
 * Cloudflare's own error statuses and up: `530` is "the tunnel behind
 * this hostname is not being served". Anything below came from the local
 * target (its 404s and 500s included) and means the chain is up.
 */
export const CLOUDFLARE_ERROR_STATUS = 520;

/**
 * HEAD probe with a deadline: the HTTP status code, or undefined when
 * nothing answered at all (timeout, connection refused, TLS reset).
 * `signal` ends the probe early — the caller stopped caring.
 */
export async function httpStatus(
	url: string,
	timeoutMs: number,
	init: { readonly method?: "HEAD" | "GET"; readonly signal?: AbortSignal } = {},
): Promise<number | undefined> {
	try {
		const deadline = AbortSignal.timeout(timeoutMs);
		const response = await fetch(url, {
			method: init.method ?? "HEAD",
			signal: init.signal === undefined ? deadline : AbortSignal.any([deadline, init.signal]),
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
