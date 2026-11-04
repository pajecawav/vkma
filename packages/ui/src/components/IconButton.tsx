import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";

/**
 * A square icon-only button. Two sizes: `md` is the top-bar chrome
 * (theme, reconnect, close, side panel), `sm` is the dense action rows
 * (copy, remove). `active` marks a toggled state. It switches the look
 * to pressed and sets aria-pressed; leave it undefined on plain buttons.
 * The label is the accessible name and the hover hint. The button rides
 * inside a Tooltip, so the hint behaves like the rest of the design
 * system's (delayed, escape-able) instead of a native title. Rest props
 * forward to the button element, so render-prop triggers (Base UI's
 * Popover.Trigger) can compose with it.
 */
export function IconButton({
	label,
	onClick,
	size = "md",
	active,
	className = "",
	children,
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	/** Accessible name and the hover tooltip. */
	label: string;
	/** Optional so render-prop triggers (Base UI's Popover.Trigger) can
	 * compose with it, the trigger supplies the click handler. */
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	size?: "sm" | "md";
	/** Pressed look for toggle buttons; omit on plain ones. */
	active?: boolean;
	className?: string;
	children: ReactNode;
}) {
	const shape = size === "sm" ? "size-6 shrink-0 rounded" : "size-7 shrink-0 rounded-md";
	const tone = active
		? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
		: size === "sm"
			? "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
			: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";
	return (
		<Tooltip content={label}>
			<button
				type="button"
				onClick={onClick}
				aria-label={label}
				aria-pressed={active}
				{...rest}
				className={`grid place-items-center ${shape} ${tone} ${className}`}
			>
				{children}
			</button>
		</Tooltip>
	);
}
