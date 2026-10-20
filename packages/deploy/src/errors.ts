/**
 * Typed error model for the whole package.
 *
 * Every failure path throws a `DeployError` with a `kind` that maps to a
 * stable process exit code:
 *
 * - `config` — invalid or missing configuration (exit 1)
 * - `user`   — user aborted, declined a prompt, or passed a bad CLI value (exit 1)
 * - `network`— fetch failure, timeout, or exceeded queue deadline (exit 2)
 * - `api`    — VK API returned an error payload (exit 3)
 * - `aborted`— aborted via AbortSignal / SIGINT (exit 130)
 */

export type DeployErrorKind = "config" | "user" | "network" | "api" | "aborted";

const KIND_TO_EXIT_CODE: Record<DeployErrorKind, number> = {
	config: 1,
	user: 1,
	network: 2,
	api: 3,
	aborted: 130,
};

export interface DeployErrorOptions {
	/** Machine-readable code: VK error code, `"E_TIMEOUT"`, etc. */
	readonly code?: string | number;
	/** Structured context that is safe to print (already redacted by callers). */
	readonly details?: unknown;
	readonly cause?: unknown;
}

export class DeployError extends Error {
	public readonly kind: DeployErrorKind;
	public readonly code?: string | number;
	public readonly details?: unknown;

	public constructor(kind: DeployErrorKind, message: string, options: DeployErrorOptions = {}) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "DeployError";
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
export class ConfigValidationError extends DeployError {
	public readonly issues: readonly ConfigIssue[];

	public constructor(issues: readonly ConfigIssue[]) {
		const body = issues.map(issue => `  - ${issue.path}: ${issue.message}`).join("\n");
		super("config", `Invalid deploy configuration:\n${body}`, { details: issues });
		this.name = "ConfigValidationError";
		this.issues = issues;
	}
}

export interface ConfigIssue {
	readonly path: string;
	readonly message: string;
}

export function isDeployError(value: unknown): value is DeployError {
	return value instanceof DeployError;
}

/** Normalizes any thrown value into a `DeployError`. */
export function toDeployError(value: unknown): DeployError {
	if (isDeployError(value)) {
		return value;
	}
	if (value instanceof Error) {
		return new DeployError("network", value.message, { cause: value });
	}
	return new DeployError("network", String(value), { details: value });
}
