/**
 * ANSI palette shared by the logger and the CLI prompts.
 *
 * Colors are semantic, not decorative: red errors, yellow caution,
 * green success, cyan progress, dim secondary info, bold action
 * required. Every `paint` call passes an explicit `enabled` flag. The
 * decision (TTY + pretty mode + NO_COLOR/--no-color) belongs to the
 * caller, never to this module.
 */

export const COLORS = {
	reset: 0,
	bold: 1,
	dim: 2,
	red: 31,
	green: 32,
	yellow: 33,
	cyan: 36,
} as const;

export type ColorName = keyof typeof COLORS;

export function paint(text: string, color: ColorName, enabled: boolean): string {
	return enabled ? `\x1b[${COLORS[color]}m${text}\x1b[0m` : text;
}
