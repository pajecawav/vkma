/** Minimal ANSI painter (subset of @vkma.dev/deploy's logger/color). */

const CODES = {
	green: "\x1b[32m",
	cyan: "\x1b[36m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
} as const;

export type PaintColor = keyof typeof CODES;

export function paint(text: string, color: PaintColor, enabled: boolean): string {
	return enabled ? `${CODES[color]}${text}\x1b[0m` : text;
}
