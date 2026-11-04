import { FAB_POSITIONS, type FabPosition } from "../fab-position.ts";
import { Tooltip } from "./Tooltip.tsx";

const LABELS: Record<FabPosition, string> = {
	"bottom-left": "Bottom left",
	bottom: "Bottom",
	"bottom-right": "Bottom right",
};

/**
 * Picks the in-page FAB placement (bottom-right / bottom / bottom-left).
 * Storage-agnostic: the surface hands in the current position and a
 * picker; chrome.storage in the extension, localStorage on the dev
 * server origin in the devtools panel (where the same-origin storage
 * event is what moves the FAB live).
 */
export function FabPositionControl({
	position,
	onPick,
}: {
	position: FabPosition;
	onPick: (position: FabPosition) => void;
}) {
	return (
		<div
			className="flex h-7 items-center rounded-md border border-neutral-200 p-0.5 dark:border-neutral-800"
			role="radiogroup"
			aria-label="DevTools position"
		>
			{FAB_POSITIONS.map(option => {
				const active = position === option;
				return (
					<Tooltip key={option} content={LABELS[option]}>
						<button
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
							{/* mini page: bottom edge + a dot at the placement */}
							<svg
								viewBox="0 0 16 16"
								width={14}
								height={14}
								aria-hidden="true"
								fill="none"
								stroke="currentColor"
								strokeWidth={1.5}
							>
								<rect
									x={1.5}
									y={1.5}
									width={13}
									height={13}
									rx={2.5}
									opacity={0.5}
								/>
								<circle
									cx={
										option === "bottom-left"
											? 4.5
											: option === "bottom"
												? 8
												: 11.5
									}
									cy={11.5}
									r={1.6}
									fill="currentColor"
									stroke="none"
								/>
							</svg>
						</button>
					</Tooltip>
				);
			})}
		</div>
	);
}
