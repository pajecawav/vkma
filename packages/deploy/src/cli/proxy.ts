/**
 * Proxy routing for the CLI.
 *
 * Honors the standard `HTTP(S)_PROXY`/`NO_PROXY` environment variables
 * plus an explicit `--proxy` flag / `proxy` config field, using Node's
 * built-in env-proxy support (`http.setGlobalProxyFromEnv`, available
 * on Node >= 22.21 / 24). Precedence matches the package layering:
 * `--proxy` flag > environment > config. On runtimes without native
 * support we warn and continue without a proxy.
 *
 * This mutates the global fetch dispatcher and therefore lives in the
 * CLI layer only. The library never routes through a proxy; library
 * consumers inject their own `fetchImpl` instead (AGENTS.md invariant #2).
 */

import http from "node:http";
import { DeployError } from "../errors.ts";

export type SetGlobalProxyFromEnv = (envLike?: Record<string, string>) => unknown;

export interface ProxySources {
	/** `--proxy` flag value (highest precedence). */
	readonly flagProxy?: string;
	/** `proxy` config field (lowest precedence). */
	readonly configProxy?: string;
	readonly env: Record<string, string | undefined>;
}

export interface ProxyLogger {
	info(message: string): void;
	warn(message: string): void;
	addSecret(secret: string): void;
}

export interface ActiveProxy {
	readonly url: string;
	/** Where the URL came from: "--proxy", an env var name, or "config proxy". */
	readonly source: string;
}

const PROXY_URL_RE = /^https?:\/\//;

/** Lowercase variants win when both are set (Node's own semantics). */
function pickEnvProxy(env: Record<string, string | undefined>): ActiveProxy | undefined {
	for (const [lower, upper] of [
		["https_proxy", "HTTPS_PROXY"],
		["http_proxy", "HTTP_PROXY"],
	] as const) {
		if (env[lower] !== undefined && env[lower] !== "") {
			return { url: env[lower], source: lower };
		}
		if (env[upper] !== undefined && env[upper] !== "") {
			return { url: env[upper], source: upper };
		}
	}
	return undefined;
}

function maskCredentials(url: string): string {
	return url.replace(/(\/\/[^:/@\s]+:)[^@/\s]+(@)/, "$1***$2");
}

function proxyPassword(url: string): string | undefined {
	const match = /\/\/[^:/@\s]+:([^@/\s]+)@/.exec(url);
	return match?.[1];
}

/**
 * Resolves the effective proxy from flag/env/config and activates it via
 * the provided setter (defaults to the native `http.setGlobalProxyFromEnv`
 * when available). Returns the active proxy, or undefined when nothing is
 * configured or the runtime cannot route through it.
 */
export function setupProxy(
	sources: ProxySources,
	logger: ProxyLogger,
	setter: SetGlobalProxyFromEnv | undefined,
): ActiveProxy | undefined {
	const envProxy = pickEnvProxy(sources.env);
	const effective =
		sources.flagProxy !== undefined
			? { url: sources.flagProxy, source: "--proxy" }
			: envProxy !== undefined
				? envProxy
				: sources.configProxy !== undefined
					? { url: sources.configProxy, source: "config proxy" }
					: undefined;
	if (effective === undefined || effective.url === "") {
		return undefined;
	}
	if (!PROXY_URL_RE.test(effective.url)) {
		throw new DeployError(
			"config",
			`proxy must be an http(s) URL (from ${effective.source}), got ${JSON.stringify(effective.url)} — socks is not supported`,
			{ code: "E_BAD_PROXY_URL" },
		);
	}
	if (setter === undefined) {
		logger.warn(
			`A proxy is configured (${effective.source}), but ${process.version} has no native proxy support — upgrade to Node 22.21+/24+. Continuing without a proxy.`,
		);
		return undefined;
	}

	const envLike: Record<string, string> = {
		HTTP_PROXY: effective.url,
		HTTPS_PROXY: effective.url,
	};
	const noProxy = sources.env["NO_PROXY"] ?? sources.env["no_proxy"];
	if (noProxy !== undefined && noProxy !== "") {
		envLike["NO_PROXY"] = noProxy;
	}
	setter(envLike);

	// Credentials in the proxy URL (http://user:pass@host) must never
	// surface: mask them in the message and register the password so any
	// later echo is redacted (AGENTS.md invariant #3).
	const password = proxyPassword(effective.url);
	if (password !== undefined) {
		logger.addSecret(password);
	}
	logger.info(`Using proxy ${maskCredentials(effective.url)} (from ${effective.source}).`);
	return effective;
}

/** The native setter on runtimes that have it, for main() to inject into tests. */
export function nativeSetGlobalProxyFromEnv(): SetGlobalProxyFromEnv | undefined {
	return (http as { setGlobalProxyFromEnv?: SetGlobalProxyFromEnv }).setGlobalProxyFromEnv;
}
