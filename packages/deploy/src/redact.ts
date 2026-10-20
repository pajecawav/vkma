/**
 * Secret redaction for logs, error details, and `--json` events.
 *
 * Two layers:
 * 1. Exact-value replacement: every registered secret (access token, etc.)
 *    longer than a small threshold is replaced with `***` wherever it occurs.
 * 2. Structural replacement: `access_token`-style query parameters are masked
 *    even when the exact value was never registered (defense in depth —
 *    upstream leaks the token into GET query strings).
 */

const MIN_SECRET_LENGTH = 8;

const REDACTED = "***";

const TOKEN_QUERY_RE = /([?&](?:access_token|token|code|client_secret)=)[^&\s]*/g;

export interface Redactor {
	/** Registers a secret value to be masked everywhere. */
	add(secret: string | undefined | null): void;
	/** Masks known secrets inside a string. */
	redactString(value: string): string;
	/** Returns a deep copy of `value` with all secret occurrences masked. */
	redact<T>(value: T): T;
}

export function createRedactor(): Redactor {
	const secrets = new Set<string>();

	function redactString(value: string): string {
		let result = value.replace(TOKEN_QUERY_RE, `$1${REDACTED}`);
		for (const secret of secrets) {
			if (secret.length >= MIN_SECRET_LENGTH && result.includes(secret)) {
				result = result.split(secret).join(REDACTED);
			}
		}
		return result;
	}

	function redact<T>(value: T, seen: WeakSet<object>): T {
		if (typeof value === "string") {
			return redactString(value) as T;
		}
		if (value instanceof Date) {
			// Dates must survive redaction as ISO strings — flattening them
			// to {} silently destroyed error diagnostics.
			return value.toISOString() as T;
		}
		if (Array.isArray(value)) {
			return value.map(item => redact(item, seen)) as T;
		}
		if (value !== null && typeof value === "object") {
			if (seen.has(value)) {
				return "[Circular]" as T;
			}
			seen.add(value);
			const source = value as Record<string, unknown>;
			const out: Record<string, unknown> = {};
			for (const key of Object.keys(source)) {
				out[key] = redact(source[key], seen);
			}
			return out as T;
		}
		return value;
	}

	return {
		add(secret: string | undefined | null): void {
			if (typeof secret === "string" && secret.length > 0) {
				secrets.add(secret);
			}
		},
		redactString,
		redact: <T>(value: T): T => redact(value, new WeakSet()),
	};
}
