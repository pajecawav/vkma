/**
 * Params prefill policy of the Execute panel: when a catalogue event is
 * picked, its payload stub may overwrite the textarea ONLY while the text
 * cannot be the user's work. Everything else (a typed JSON object, broken
 * JSON, anything non-empty) wins over the stub.
 */

/**
 * The text for the field after `stub` was picked, or undefined when the
 * current text must stay. `lastAutoFill` is the text this surface wrote
 * last time; `untouched` is what its field starts as, where an event
 * without params puts it back.
 */
export function nextParamsText(
	current: string,
	stub: Record<string, unknown> | undefined,
	lastAutoFill: string | undefined,
	untouched = "",
): string | undefined {
	// An empty stub has nothing to show, but it still clears the auto-fill
	// this surface wrote before: the previous event's params must not ride
	// along with a send that takes none.
	if (!stub || Object.keys(stub).length === 0) {
		return current === lastAutoFill ? untouched : undefined;
	}
	const text = JSON.stringify(stub, null, 2);
	return isUntouched(current) || current === lastAutoFill ? text : undefined;
}

/** Empty, whitespace, or a JSON object without keys: nothing to lose. */
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
