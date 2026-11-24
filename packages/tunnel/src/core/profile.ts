/**
 * Default profile derivation.
 *
 * A tunnel identity (and with it the public URL) is per project: the
 * default profile is the project directory's basename, so two mini apps
 * developed side by side keep two stable URLs. Explicit `profile` config
 * always wins.
 */

import { createHash } from "node:crypto";
import path from "node:path";
import { PROFILE_PATTERN } from "../constants.ts";
import { TunnelError } from "../errors.ts";

/**
 * Derives the default profile name for a directory: its basename,
 * sanitized to the filename-safe profile charset.
 *
 * A basename with no Latin letter or digit in it — a Cyrillic folder name,
 * for one — has nothing to sanitize to. It becomes `project-<8 hex of the
 * name>` instead of one shared `default`: every such project used to land
 * on that one profile, and share one identity and one public URL. Falls
 * back to `"default"` when there is no basename at all (the filesystem
 * root).
 */
export function defaultProfile(cwd: string): string {
	const base = path.basename(path.resolve(cwd));
	const sanitized = sanitizeProfile(base);
	if (sanitized !== "") {
		return sanitized;
	}
	if (base === "") {
		return "default";
	}
	return `project-${createHash("sha256").update(base).digest("hex").slice(0, 8)}`;
}

/** Sanitizes any string into a profile-safe name (filename charset). */
export function sanitizeProfile(name: string): string {
	const trimmed = name.trim();
	const replaced = trimmed.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[._-]+/, "");
	return replaced.slice(0, 64);
}

/** Validates a user-supplied profile; throws a config error naming it. */
export function assertValidProfile(profile: string): void {
	if (!PROFILE_PATTERN.test(profile)) {
		throw new TunnelError(
			"config",
			`Invalid profile ${JSON.stringify(profile)}: expected letters, digits, ".", "_" or "-" (starting with a letter or digit)`,
			{ code: "E_BAD_PROFILE" },
		);
	}
}
