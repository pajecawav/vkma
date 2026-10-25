import { useEffect, useState } from "react";
import {
	FAB_POSITION_KEY,
	FAB_POSITIONS,
	normalizeFabPosition,
	type FabPosition,
} from "../shared/fab-position.ts";

const LABELS: Record<FabPosition, string> = {
	"bottom-right": "bottom right",
	bottom: "bottom",
	"bottom-left": "bottom left",
};

/**
 * Picks the in-page FAB placement (bottom-right / bottom / bottom-left) —
 * a global preference in chrome.storage.local; the host script follows
 * it live via storage.onChanged, so the FAB moves the moment a state is
 * picked here, on every open VK tab.
 */
export function FabPositionControl() {
	const [position, setPosition] = useState<FabPosition>("bottom-right");

	useEffect(() => {
		void chrome.storage.local.get(FAB_POSITION_KEY).then(stored => {
			setPosition(normalizeFabPosition(stored[FAB_POSITION_KEY]));
		});
		const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
			if (area === "local" && FAB_POSITION_KEY in changes) {
				setPosition(normalizeFabPosition(changes[FAB_POSITION_KEY]?.newValue));
			}
		};
		chrome.storage.onChanged.addListener(listener);
		return () => {
			chrome.storage.onChanged.removeListener(listener);
		};
	}, []);

	const pick = (next: FabPosition) => {
		setPosition(next);
		void chrome.storage.local.set({ [FAB_POSITION_KEY]: next });
	};

	return (
		<div
			className="flex h-7 items-center rounded-md border border-neutral-200 p-0.5 dark:border-neutral-800"
			role="radiogroup"
			aria-label="DevTools position"
			title="DevTools position on the page"
		>
			{FAB_POSITIONS.map(option => {
				const active = position === option;
				return (
					<button
						key={option}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => pick(option)}
						title={LABELS[option]}
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
							<rect x={1.5} y={1.5} width={13} height={13} rx={2.5} opacity={0.5} />
							<circle
								cx={option === "bottom-left" ? 4.5 : option === "bottom" ? 8 : 11.5}
								cy={11.5}
								r={1.6}
								fill="currentColor"
								stroke="none"
							/>
						</svg>
					</button>
				);
			})}
		</div>
	);
}
