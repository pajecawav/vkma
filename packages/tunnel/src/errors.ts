/**
 * Typed error model for the whole package.
 *
 * Every failure path throws a `TunnelError` with a `kind` that maps to a
 * stable CLI exit code (same scheme as @vkma.dev/deploy):
 *
 * - `config`,  invalid or missing configuration, bad option values (exit 1)
 * - `user`,    user aborted, bad CLI value (exit 1)
 * - `network`, tunnel provisioning or connection failure (exit 2)
 * - `aborted`, aborted via AbortSignal / SIGINT (exit 130)
 */

export type TunnelErrorKind = "config" | "user" | "network" | "aborted";

const KIND_TO_EXIT_CODE: Record<TunnelErrorKind, number> = {
	config: 1,
	user: 1,
	network: 2,
	aborted: 130,
};

export interface TunnelErrorOptions {
	/** Machine-readable code: `"E_UNKNOWN_PROVIDER"`, `"E_NO_IDENTITY"`, etc. */
	readonly code?: string;
	/** Structured context that is safe to print. */
	readonly details?: unknown;
	readonly cause?: unknown;
}

export class TunnelError extends Error {
	public readonly kind: TunnelErrorKind;
	public readonly code?: string;
	public readonly details?: unknown;

	public constructor(kind: TunnelErrorKind, message: string, options: TunnelErrorOptions = {}) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "TunnelError";
		this.kind = kind;
		this.code = options.code;
		this.details = options.details;
	}

	public get exitCode(): number {
		return KIND_TO_EXIT_CODE[this.kind];
	}

	public toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			kind: this.kind,
			code: this.code,
			message: this.message,
			details: this.details,
		};
	}
}

/** Aggregates multiple config validation failures into one readable error. */
export class ConfigValidationError extends TunnelError {
	public readonly issues: readonly ConfigIssue[];

	public constructor(issues: readonly ConfigIssue[]) {
		const body = issues.map(issue => `  - ${issue.path}: ${issue.message}`).join("\n");
		super("config", `Invalid tunnel configuration:\n${body}`, { details: issues });
		this.name = "ConfigValidationError";
		this.issues = issues;
	}

	public static from(issues: readonly ConfigIssue[], fallback: string): ConfigValidationError {
		return new ConfigValidationError(
			issues.length > 0 ? issues : [{ path: "(root)", message: fallback }],
		);
	}
}

export interface ConfigIssue {
	readonly path: string;
	readonly message: string;
}

export function isTunnelError(value: unknown): value is TunnelError {
	return value instanceof TunnelError;
}

/** Normalizes any thrown value into a `TunnelError`. */
export function toTunnelError(value: unknown): TunnelError {
	if (isTunnelError(value)) {
		return value;
	}
	if (value instanceof Error) {
		return new TunnelError("network", value.message, { cause: value });
	}
	return new TunnelError("network", String(value), { details: value });
}
