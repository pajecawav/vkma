import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";

export interface SwitchProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	/** Accessible name — the visible row label is not a native label element. */
	ariaLabel: string;
	/** Hover hint; native `title` on the base-ui span is unreliable through the render chain, so this is a real Tooltip. */
	tooltip?: ReactNode;
	className?: string;
}

/**
 * A toggle switch on Base UI's Switch: the role/aria-checked wiring,
 * Space/keyboard activation and the form input come with it. The look is
 * the house pill — emerald when on, neutral when off — with the thumb
 * sliding on a transform transition. States style through base-ui's
 * data-checked attribute, so no internal rendering branches on `checked`.
 */
export function Switch({ checked, onCheckedChange, ariaLabel, tooltip, className }: SwitchProps) {
	const control = (
		<BaseSwitch.Root
			checked={checked}
			onCheckedChange={next => {
				onCheckedChange(next);
			}}
			aria-label={ariaLabel}
			className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full bg-neutral-300 transition-colors duration-150 outline-none dark:bg-neutral-700 data-[checked]:bg-emerald-500 ${className ?? ""}`}
		>
			<BaseSwitch.Thumb className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none data-[checked]:translate-x-5" />
		</BaseSwitch.Root>
	);
	// Without a hint the control stands alone; with one the Tooltip's
	// Trigger render chain attaches hover/focus to the switch itself —
	// no wrapper element, so flex rows keep their layout.
	return tooltip === undefined ? control : <Tooltip content={tooltip}>{control}</Tooltip>;
}
