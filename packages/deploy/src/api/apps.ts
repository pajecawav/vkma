/**
 * Mini app metadata for the deploy plan: the app's display title.
 */

import { callApi, type FetchClientOptions } from "./client.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Resolves the app's title with one read-only `apps.get`.
 *
 * `undefined` is the honest "no title": VK answers an unknown or invisible
 * id with an empty list rather than an error (verified live). Transport and
 * VK errors propagate as `DeployError`s; whether a title is worth failing
 * over is the caller's decision — for the CLI plan it is decoration.
 */
export async function getAppTitle(
	appId: number,
	options: FetchClientOptions,
): Promise<string | undefined> {
	const response = await callApi("apps.get", { app_id: appId, app_fields: "title" }, options);
	const items = response["items"];
	const first = Array.isArray(items) ? items[0] : undefined;
	const title = isRecord(first) ? first["title"] : undefined;
	return typeof title === "string" && title.trim() !== "" ? title : undefined;
}
