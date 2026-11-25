import { FAB_POSITIONS, type FabPosition } from "../fab-position.ts";
import { CheckIcon } from "./icons.tsx";

const LABELS: Record<FabPosition, string> = {
	"bottom-left": "Bottom left",
	bottom: "Bottom",
	"bottom-right": "Bottom right",
};

/** Mini page: bottom edge + a dot at the placement. */
function PositionGlyph({ option }: { option: FabPosition }) {
	return (
		<svg
			viewBox="0 0 16 16"
			width={14}
			height={14}
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			className="shrink-0"
		>
			<rect x={1.5} y={1.5} width={13} height={13} rx={2.5} opacity={0.5} />
			<circle
				cx={option === "bottom-left" ? 4.5 : option === "bottom" ? 8 : 11.5}
				cy={11.5}
				r={1.6}
				fill="currentColor"
				stroke="none"
			/>
		</svg>
	);
}

/**
 * Picks the in-page FAB placement (bottom-right / bottom / bottom-left).
 * Storage-agnostic: the surface hands in the current position and a
 * picker; chrome.storage in the extension, localStorage on the dev
 * server origin in the devtools panel (where the same-origin storage
 * event is what moves the FAB live).
 *
 * Two presentations of the same radiogroup: `segmented` is the header's
 * inline control (three icon radios, the state at a glance), `list` is
 * its copy inside a header's ⋯ popover (labeled rows — there the glyphs
 * would have no room to explain themselves).
 */
export function FabPositionControl({
	position,
	onPick,
	variant = "segmented",
}: {
	position: FabPosition;
	onPick: (position: FabPosition) => void;
	variant?: "segmented" | "list";
}) {
	if (variant === "list") {
		return (
			<div role="radiogroup" aria-label="DevTools position" className="flex flex-col gap-0.5">
				<p className="px-2 pt-1 pb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
					Panel position
				</p>
				{FAB_POSITIONS.map(option => {
					const active = position === option;
					return (
						<button
							key={option}
							type="button"
							role="radio"
							aria-checked={active}
							onClick={() => onPick(option)}
							className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium ${
								active
									? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
									: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
							}`}
						>
							<PositionGlyph option={option} />
							{LABELS[option]}
							{active && (
								<CheckIcon
									width={13}
									height={13}
									className="ml-auto text-neutral-500 dark:text-neutral-400"
								/>
							)}
						</button>
					);
				})}
			</div>
		);
	}

	return (
		<div
			className="flex h-7 items-center rounded-md border border-neutral-200 p-0.5 dark:border-neutral-800"
			role="radiogroup"
			aria-label="DevTools position"
		>
			{FAB_POSITIONS.map(option => {
				const active = position === option;
				return (
					<button
						key={option}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => onPick(option)}
						className={`grid h-6 w-7 place-items-center rounded-[4px] ${
							active
								? "bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900"
								: "text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
						}`}
					>
						<PositionGlyph option={option} />
					</button>
				);
			})}
		</div>
	);
}
