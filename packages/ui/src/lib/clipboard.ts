/**
 * Clipboard write with the FAB-iframe fallback: the async clipboard API
 * can be unavailable in an unfocused document or under a restrictive
 * permission policy — a hidden textarea + execCommand still works in
 * same-origin frames.
 * @returns whether the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
	const fallback = (): boolean => {
		const area = document.createElement("textarea");
		area.value = text;
		area.style.position = "fixed";
		area.style.opacity = "0";
		document.body.append(area);
		area.select();
		try {
			return document.execCommand("copy");
		} catch {
			return false; // the user can still select the text manually
		} finally {
			area.remove();
		}
	};
	if (navigator.clipboard?.writeText) {
		return navigator.clipboard.writeText(text).then(
			() => true,
			() => fallback(),
		);
	}
	return fallback();
}
