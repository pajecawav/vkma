/**
 * Params prefill policy of the Execute panel: when a catalogue event is
 * picked, its payload stub may overwrite the textarea ONLY while the text
 * cannot be the user's work. Everything else — a typed JSON object, broken
 * JSON, anything non-empty — wins over the stub.
 */

/** The text this surface last wrote itself; replacing it again is safe. */
export function nextParamsText(
	current: string,
	stub: Record<string, unknown> | undefined,
	lastAutoFill: string | undefined,
): string | undefined {
	// An empty stub shows nothing the default textarea doesn't already show.
	if (!stub || Object.keys(stub).length === 0) {
		return undefined;
	}
	const text = JSON.stringify(stub, null, 2);
	if (isUntouched(current) || current === lastAutoFill) {
		return text;
	}
	return undefined;
}

/** Empty, whitespace, or a JSON object without keys — nothing to lose. */
function isUntouched(current: string): boolean {
	const trimmed = current.trim();
	if (trimmed === "") {
		return true;
	}
	try {
		const parsed: unknown = JSON.parse(trimmed);
		return (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed) &&
			Object.keys(parsed).length === 0
		);
	} catch {
		return false;
	}
}
