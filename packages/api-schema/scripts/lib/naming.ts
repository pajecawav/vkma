/**
 * Naming helpers for the VK API schema generator.
 *
 * `pascal` mirrors json2code's `styleName(name, "pascal")` so that names
 * derived on our side (barrels, EnumNames constants) always match the names
 * json2code emits for the same schema definition.
 */

/** Split a name into words: by separators (non-alphanumerics) and camelCase boundaries. */
function words(name: string): readonly string[] {
	return name
		.split(/[^$A-Za-z0-9]+/)
		.filter(Boolean)
		.flatMap(w => w.split(/(?<=[a-z0-9])(?=[A-Z])/))
		.filter(Boolean);
}

/** Convert a schema definition name to PascalCase (`apps_app` → `AppsApp`). */
export function pascal(name: string): string {
	const ws = words(name);
	if (ws.length === 0) {
		return name;
	}
	const joined = ws.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
	return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
}

/**
 * Convert a human-readable enum name to a SCREAMING_SNAKE object key
 * (`"not moderated"` → `NOT_MODERATED`).
 */
export function enumKey(name: string): string {
	return name
		.trim()
		.toUpperCase()
		.replaceAll(/[^A-Z0-9]+/g, "_")
		.replaceAll(/^_+|_+$/g, "");
}
