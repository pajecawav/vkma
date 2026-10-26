/**
 * The timeline's event-name filter. Plain text keeps its meaning — a
 * case-insensitive substring match — but anything regex-shaped
 * (`Get.*Info`, `Storage|Photo`) compiles as a case-insensitive regexp,
 * so alternations and wildcards work without a mode toggle. An invalid
 * pattern (an unclosed `(` mid-typing) degrades to substring matching
 * instead of erroring.
 */
export function compileNameFilter(query: string): ((name: string) => boolean) | undefined {
	const trimmed = query.trim();
	if (trimmed === "") {
		return undefined;
	}
	try {
		const pattern = new RegExp(trimmed, "i");
		return name => pattern.test(name);
	} catch {
		const needle = trimmed.toLowerCase();
		return name => name.toLowerCase().includes(needle);
	}
}
