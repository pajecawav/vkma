/**
 * Legacy config support: maps `vk-hosting-config.json` (the config format of
 * @vkontakte/vk-miniapps-deploy) onto our camelCase schema.
 *
 * The mapping is intentionally total: every field upstream reads is either
 * mapped or reported as a warning. Unknown fields are warned about, never
 * silently dropped — that is how migration mistakes get caught early.
 */

import type { DeployConfigInput } from "./schema.ts";

export const LEGACY_CONFIG_FILENAME = "vk-hosting-config.json";

/** snake_case fields read by upstream 1.0.3. */
const KNOWN_LEGACY_FIELDS = new Set([
	"static_path",
	"staticpath",
	"app_id",
	"endpoints",
	"access_token",
	"bundleFile",
	"update_prod",
	"update_dev",
	"test_group_name",
	"noprompt",
	"debug",
	"api_host",
	"oauth_host",
	"proxy_url",
	"expires_in",
]);

function asBoolean(value: unknown, field: string): boolean | undefined {
	if (typeof value === "boolean") {
		return value;
	}
	if (value === 0 || value === 1) {
		return value === 1;
	}
	throw new Error(
		`Legacy field "${field}" must be 0, 1, or boolean, got ${JSON.stringify(value)}`,
	);
}

export interface LegacyMapping {
	readonly config: DeployConfigInput;
	readonly warnings: readonly string[];
}

export function mapLegacyConfig(raw: unknown): LegacyMapping {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("Legacy config must be a JSON object");
	}

	const source = raw as Record<string, unknown>;
	const config: Record<string, unknown> = {};
	const warnings: string[] = [];

	const has = (key: string): boolean => Object.hasOwn(source, key) && source[key] !== undefined;
	const str = (key: string): string | undefined =>
		typeof source[key] === "string" ? source[key] : undefined;

	if (has("static_path") || has("staticpath")) {
		const value = str("static_path") ?? str("staticpath");
		if (value === undefined) {
			throw new Error('Legacy field "static_path" must be a string');
		}
		config["staticPath"] = value;
	}

	if (has("app_id")) {
		const value = source["app_id"];
		if (typeof value !== "number" || !Number.isInteger(value)) {
			throw new Error('Legacy field "app_id" must be an integer');
		}
		config["appId"] = value;
	}

	if (has("endpoints")) {
		const value = source["endpoints"];
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			throw new Error('Legacy field "endpoints" must be an object');
		}
		config["endpoints"] = value;
	}

	if (has("access_token")) {
		const value = str("access_token");
		if (value === undefined) {
			throw new Error('Legacy field "access_token" must be a string');
		}
		config["accessToken"] = value;
	}

	if (has("bundleFile")) {
		const value = str("bundleFile");
		if (value === undefined) {
			throw new Error('Legacy field "bundleFile" must be a string');
		}
		config["bundle"] = value;
	}

	if (has("update_prod")) {
		config["updateProd"] = asBoolean(source["update_prod"], "update_prod");
	}

	if (has("update_dev")) {
		config["updateDev"] = asBoolean(source["update_dev"], "update_dev");
	}

	if (has("test_group_name")) {
		const value = str("test_group_name");
		if (value === undefined) {
			throw new Error('Legacy field "test_group_name" must be a string');
		}
		config["testGroupName"] = value;
	}

	if (has("api_host")) {
		const value = str("api_host");
		if (value === undefined) {
			throw new Error('Legacy field "api_host" must be a string');
		}
		config["apiHost"] = value;
	}

	if (has("oauth_host")) {
		const value = str("oauth_host");
		if (value === undefined) {
			throw new Error('Legacy field "oauth_host" must be a string');
		}
		config["oauthHost"] = value;
	}

	if (has("noprompt")) {
		warnings.push(
			'Legacy field "noprompt" is ignored: vkma-deploy never prompts unless --interactive is passed.',
		);
	}

	if (has("debug")) {
		warnings.push('Legacy field "debug" is ignored: use --verbose (-v) instead.');
	}

	if (has("proxy_url")) {
		warnings.push(
			'Legacy field "proxy_url" is not supported yet: set NODE_USE_ENV_PROXY=1 (Node 24+) or watch the proxy tracking issue.',
		);
	}

	if (has("expires_in")) {
		warnings.push('Legacy field "expires_in" is ignored.');
	}

	for (const key of Object.keys(source)) {
		if (!KNOWN_LEGACY_FIELDS.has(key)) {
			warnings.push(`Legacy config contains unknown field "${key}" — it was ignored.`);
		}
	}

	return { config, warnings };
}
