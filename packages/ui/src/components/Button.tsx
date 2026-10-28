import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
	/** Text only, hover highlight — secondary actions (Deny). */
	ghost: "text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
	/** The outlined default (Connect, Rotate, Always allow). */
	outline:
		"border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800",
	/** The ink-filled primary (Allow, Retry, resume). */
	solid: "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300",
} as const;

const SIZES = {
	/** Rows and cards (approval buttons, resume). */
	sm: "h-7 px-2.5 text-[11px]",
	/** Standalone forms and full screens (StatusGate, Retry). */
	md: "h-8 px-3 text-xs",
} as const;

/**
 * The text button. House variants over one base: small mono-ish labels,
 * tight padding, ink-filled primary. `type="button"` by default.
 */
export function Button({
	variant = "outline",
	size = "sm",
	className = "",
	children,
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: keyof typeof VARIANTS;
	size?: keyof typeof SIZES;
}) {
	return (
		<button
			type="button"
			{...rest}
			className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
		>
			{children}
		</button>
	);
}
