/**
 * Shared constants: protocol defaults and upstream-compatible wire values.
 *
 * Wire-level names (URL keys, event codes, bitmask values) mirror
 * @vkontakte/vk-miniapps-deploy 1.0.3 so that deployments behave identically.
 */

/** VK API version used by default. */
export const API_VERSION = "5.199";

/**
 * VK API version pinned by upstream @vkontakte/vk-miniapps-deploy 1.0.3.
 * Still accepted via `apiVersion` for byte-identical upstream behavior.
 */
export const LEGACY_API_VERSION = "5.131";

/** VK service application used for the CLI OAuth device flow. */
export const OAUTH_CLIENT_ID = 6670517;

/** `cli_version` sent with every API call, as upstream does. */
export const CLI_VERSION = 2;

export const DEFAULT_API_HOST = "https://api.vk.ru/method/";
export const DEFAULT_OAUTH_HOST = "https://oauth.vk.ru/";

/** Default cap on waiting for the hosting queue (seconds). Fixes upstream issue #119. */
export const DEFAULT_QUEUE_TIMEOUT_SEC = 600;

/** Long-poll `wait` parameter for `act=a_check` (seconds). */
export const QUEUE_POLL_WAIT_SEC = 5;

/** Environment bitmask values used by the hosting API. */
export const ENV_DEV = 1;
export const ENV_PRODUCTION = 2;
export const ENV_BOTH = 3;

/** Hosting queue event codes. */
export const EVENT_CODE = {
	success: 200,
	urlsChanged: 201,
	skipEnvironment: 202,
	pushSent: 203,
	pushApproved: 204,
	confirmViaMessage: 205,
	testGroupUrlUpdated: 206,
} as const;

/** Non-fatal queue error code: test group URL update failure. */
export const ERROR_TEST_GROUP_UPDATE = 109;

/** Raw URL keys returned by the queue, mapped to platform names for humans. */
export const URL_KEYS = {
	desktopDev: "vk_app_desktop_dev_url",
	mobileDev: "vk_app_dev_url",
	mobileWebDev: "vk_mini_app_mvk_dev_url",
	webLegacy: "iframe_url",
	web: "iframe_secure_url",
	mobile: "m_iframe_secure_url",
	mobileWeb: "vk_mini_app_mvk_url",
} as const;

/** Platform labels for pretty output (kept compatible with upstream). */
export const PLATFORM_LABELS = {
	[URL_KEYS.desktopDev]: "vk.ru",
	[URL_KEYS.mobileDev]: "iOS & Android",
	[URL_KEYS.mobileWebDev]: "m.vk.ru",
	[URL_KEYS.web]: "vk.ru",
	[URL_KEYS.mobile]: "iOS & Android",
	[URL_KEYS.mobileWeb]: "m.vk.ru",
} as const;

/** Multipart field name expected by the upload endpoint. */
export const UPLOAD_FIELD_NAME = "file";

/** Default zip output when a prebuilt bundle is not provided. */
export const DEFAULT_BUNDLE_NAME = "bundle.zip";
