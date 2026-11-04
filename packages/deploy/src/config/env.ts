/**
 * Environment variable layer.
 *
 * Primary names are ours (`VKMA_*`); legacy `MINI_APPS_*` names are accepted
 * forever so that existing CI pipelines keep working when migrating from
 * @vkontakte/vk-miniapps-deploy. `CI_URLS` keeps its upstream meaning:
 * print machine-readable URL keys instead of platform labels.
 */

import { ConfigValidationError, type ConfigIssue } from "../errors.ts";
import type { DeployConfigInput } from "./schema.ts";

export const ENV_NAMES = {
	accessToken: ["VKMA_ACCESS_TOKEN", "MINI_APPS_ACCESS_TOKEN"],
	appId: ["VKMA_APP_ID", "MINI_APPS_APP_ID"],
	environment: ["VKMA_ENVIRONMENT", "MINI_APPS_ENVIRONMENT"],
	testGroup: ["VKMA_TEST_GROUP"],
	queueTimeout: ["VKMA_TIMEOUT"],
	ciUrls: ["CI_URLS"],
} as const;

export interface EnvParseResult {
	readonly overrides: DeployConfigInput;
	readonly ciUrls: boolean;
}

/** Normalizes `dev|development|prod|production|both` (case-insensitive). */
export function normalizeEnvironment(value: string): "dev" | "production" | "both" {
	const lowered = value.toLowerCase();
	if (lowered === "dev" || lowered === "development") {
		return "dev";
	}
	if (lowered === "prod" || lowered === "production") {
		return "production";
	}
	if (lowered === "both" || lowered === "all") {
		return "both";
	}
	throw new Error(`Invalid environment "${value}": expected "dev", "production", or "both"`);
}

function firstDefined(
	env: Record<string, string | undefined>,
	names: readonly string[],
): { value: string; name: string } | undefined {
	for (const name of names) {
		const value = env[name];
		if (value !== undefined && value !== "") {
			return { value, name };
		}
	}
	return undefined;
}

/**
 * Reads env vars into config overrides.
 * `VKMA_*` wins over its `MINI_APPS_*` alias when both are set.
 * Throws {@link ConfigValidationError} on malformed values, unlike upstream,
 * which silently fell back to defaults on a bad `MINI_APPS_ENVIRONMENT`.
 */
export function readEnv(env: Record<string, string | undefined>): EnvParseResult {
	const issues: ConfigIssue[] = [];
	const overrides: Record<string, unknown> = {};

	const accessToken = firstDefined(env, ENV_NAMES.accessToken);
	if (accessToken !== undefined) {
		overrides["accessToken"] = accessToken.value;
	}

	const appIdRaw = firstDefined(env, ENV_NAMES.appId);
	if (appIdRaw !== undefined) {
		const appId = Number.parseInt(appIdRaw.value, 10);
		if (!Number.isInteger(appId) || appId <= 0 || String(appId) !== appIdRaw.value.trim()) {
			issues.push({
				path: `env ${appIdRaw.name}`,
				message: `expected a positive integer, got ${JSON.stringify(appIdRaw.value)}`,
			});
		} else {
			overrides["appId"] = appId;
		}
	}

	const environmentRaw = firstDefined(env, ENV_NAMES.environment);
	if (environmentRaw !== undefined) {
		try {
			overrides["environment"] = normalizeEnvironment(environmentRaw.value);
		} catch (error) {
			issues.push({
				path: `env ${environmentRaw.name}`,
				message: (error as Error).message,
			});
		}
	}

	const testGroup = firstDefined(env, ENV_NAMES.testGroup);
	if (testGroup !== undefined) {
		overrides["testGroupName"] = testGroup.value;
	}

	const timeoutRaw = firstDefined(env, ENV_NAMES.queueTimeout);
	if (timeoutRaw !== undefined) {
		const timeout = Number.parseInt(timeoutRaw.value, 10);
		// Round-trip like appId: "1e3"/"600s" must not silently truncate to
		// 1/600. A user asking for 1000 seconds got a 1-second deadline.
		if (
			!Number.isInteger(timeout) ||
			timeout < 1 ||
			String(timeout) !== timeoutRaw.value.trim()
		) {
			issues.push({
				path: `env ${timeoutRaw.name}`,
				message: `expected a positive integer (seconds), got ${JSON.stringify(timeoutRaw.value)}`,
			});
		} else {
			overrides["queueTimeoutSec"] = timeout;
		}
	}

	if (issues.length > 0) {
		throw new ConfigValidationError(issues);
	}

	return {
		overrides,
		ciUrls: firstDefined(env, ENV_NAMES.ciUrls) !== undefined,
	};
}
