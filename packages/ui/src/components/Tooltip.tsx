import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

export type TooltipPlacement =
	| "top"
	| "top-start"
	| "top-end"
	| "bottom"
	| "bottom-start"
	| "bottom-end"
	| "left"
	| "left-start"
	| "left-end"
	| "right"
	| "right-start"
	| "right-end";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

function splitPlacement(placement: TooltipPlacement): { side: Side; align: Align } {
	const [side, align] = placement.split("-") as [Side, Align | undefined];
	return { side, align: align ?? "center" };
}

export interface TooltipProps {
	content: ReactNode;
	placement?: TooltipPlacement;
	disabled?: boolean;
	/** Per-trigger open delay override (ms): dense lists want more than the shared 200. */
	delay?: number;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	className?: string;
	/** The single element the tooltip attaches to. It must forward props to a
	 * DOM element, plain `button`/`span` do. */
	children: ReactElement;
}

/**
 * A hover/focus hint on Base UI's Tooltip. The popup paints in the
 * inverse surface (dark-on-light, light-on-dark) at the panel's small
 * text size; long hints wrap at a width cap. The Trigger renders the
 * child element in place, no wrapper DOM, flex rows keep their layout.
 * Rendering nothing (empty content) is legal and renders the child alone.
 *
 * Delay/closeDelay live on the shared provider in `UiProvider`, so every
 * surface times its hints identically.
 */
export function Tooltip({
	content,
	placement = "top",
	disabled,
	delay,
	open,
	defaultOpen,
	onOpenChange,
	className,
	children,
}: TooltipProps) {
	if (content === null || content === undefined || content === "") {
		return children;
	}
	const { side, align } = splitPlacement(placement);
	return (
		<BaseTooltip.Root
			open={open}
			defaultOpen={defaultOpen}
			disabled={disabled}
			onOpenChange={next => {
				onOpenChange?.(next);
			}}
		>
			<BaseTooltip.Trigger render={children} delay={delay} />
			<BaseTooltip.Portal>
				<BaseTooltip.Positioner
					side={side}
					align={align}
					sideOffset={6}
					collisionPadding={8}
					className="pointer-events-none z-50 max-w-80"
				>
					<BaseTooltip.Popup
						className={`z-50 rounded-md bg-neutral-900 px-2 py-1 text-xs leading-relaxed text-neutral-50 shadow-lg outline-none [transform-origin:var(--transform-origin)] dark:bg-neutral-100 dark:text-neutral-900 transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 ${className ?? ""}`}
					>
						{content}
					</BaseTooltip.Popup>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		</BaseTooltip.Root>
	);
}
