/**
 * The sensitive-value set every vkma.dev surface agrees on: launch-param
 * keys whose values are blurred in the UI (`sign`, tokens), applied to
 * EVERY rendered surface, the launch-params grid AND any url string
 * (a raw `sign=...` query must not sit unblurred one line above the
 * blurred grid, in text or in a tooltip). Covers both eras: the modern
 * `vk_*` launch set and the legacy game params (`secret` is the
 * api.php-era session secret).
 */
export const SENSITIVE_PARAMS = new Set(["sign", "access_token", "auth_key", "sid", "secret"]);

const SENSITIVE_URL_RE = /([?&#](sign|access_token|auth_key|sid|secret)=)[^&\s]*/gi;

/** Mask sensitive query/hash values inside a url string. */
export function scrubUrl(url: string): string {
	return url.replace(SENSITIVE_URL_RE, "$1•••••");
}
