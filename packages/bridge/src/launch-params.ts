/**
 * Launch params: parsing the `vk_*` query string every mini app is opened
 * with, into the typed shape of the catalogue's `GetLaunchParamsResponse`
 * plus the extra keys only present in the URL form.
 */

import type { GetLaunchParamsResponse } from "@vkma.dev/bridge-schema";

const LANGUAGES = new Set(["ru", "uk", "ua", "en", "be", "kz", "pt", "es"]);

const GROUP_ROLES = new Set(["admin", "editor", "member", "moder", "none"]);

const PLATFORMS = new Set([
	"desktop_web",
	"desktop_web_messenger",
	"desktop_app_messenger",
	"desktop_web_ok",
	"mobile_web",
	"mobile_web_ok",
	"mobile_android",
	"mobile_android_ok",
	"mobile_android_messenger",
	"mobile_iphone",
	"mobile_iphone_ok",
	"mobile_iphone_messenger",
	"mobile_ipad",
]);

/**
 * Launch params as they appear in the URL — a superset of
 * `GetLaunchParamsResponse` with the URL-only keys. The OK (Odnoklassniki)
 * keys (`vk_client`, `vk_ok_*`, `vk_original_vk_id`, `vk_are_pushes_enabled`)
 * come from the catalogue as optional — vk.ru hosts never send them.
 */
export interface LaunchParams extends GetLaunchParamsResponse {
	vk_chat_id: string;
	vk_is_recommended: number;
	vk_profile_id: number;
	vk_has_profile_button: number;
	vk_testing_group_id: number;
	odr_enabled: undefined | 1;
}

/**
 * Parses launch params out of a query string (à la
 * `location.search.slice(1)`), field by field, keeping only the known keys
 * with validated values.
 *
 * @see https://dev.vk.ru/mini-apps/development/launch-params
 */
export const parseURLSearchParamsForGetLaunchParams = (
	searchParams: string,
): Partial<LaunchParams> => {
	const launchParams: Partial<LaunchParams> = {};

	try {
		const parsedSearchParams = new URLSearchParams(searchParams);

		const convertToggleStateFromStringToNumber = (value: string): 0 | 1 | undefined => {
			// OK hosts serialize toggles both ways ("true"/"false" and "0"/"1")
			switch (value) {
				case "0":
				case "false":
					return 0;
				case "1":
				case "true":
					return 1;
				default:
					return undefined;
			}
		};

		parsedSearchParams.forEach((value, query) => {
			switch (query) {
				case "vk_ts":
				case "vk_is_recommended":
				case "vk_profile_id":
				case "vk_has_profile_button":
				case "vk_testing_group_id":
				case "vk_user_id":
				case "vk_app_id":
				case "vk_group_id":
				case "vk_ok_app_id":
				case "vk_ok_user_id":
				case "vk_original_vk_id":
					launchParams[query] = Number(value);
					break;
				case "sign":
				case "vk_chat_id":
				case "vk_ref":
				case "vk_ok_ref":
				case "vk_client":
				case "vk_access_token_settings":
					launchParams[query] = value;
					break;
				case "odr_enabled":
					launchParams.odr_enabled = value === "1" ? 1 : undefined;
					break;
				case "vk_is_app_user":
				case "vk_are_notifications_enabled":
				case "vk_are_pushes_enabled":
				case "vk_is_favorite": {
					launchParams[query] = convertToggleStateFromStringToNumber(value);
					break;
				}
				case "vk_language": {
					launchParams.vk_language = LANGUAGES.has(value)
						? (value as Partial<LaunchParams>["vk_language"])
						: undefined;
					break;
				}
				case "vk_viewer_group_role": {
					launchParams.vk_viewer_group_role = GROUP_ROLES.has(value)
						? (value as Partial<LaunchParams>["vk_viewer_group_role"])
						: undefined;
					break;
				}
				case "vk_platform": {
					launchParams.vk_platform = PLATFORMS.has(value)
						? (value as Partial<LaunchParams>["vk_platform"])
						: undefined;
					break;
				}
			}
		});
	} catch (error) {
		console.warn(error);
	}

	return launchParams;
};
