import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard.ts";
import { CheckIcon, CopyIcon } from "./icons.tsx";

/**
 * A read-only snippet field with a copy button, connection snippets,
 * ids, anything long and copy-shaped. Clicking focuses and selects the
 * whole value (Ctrl+C works without aiming); the button flashes
 * "Copied" on success. The house input look, mono.
 */
export function CopyInput({ value, ariaLabel }: { value: string; ariaLabel: string }) {
	const [copied, setCopied] = useState(false);
	const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	// the "copied" flash outlives the component's unmount otherwise
	useEffect(() => () => clearTimeout(resetTimer.current), []);

	const copy = () => {
		void copyText(value).then(ok => {
			if (!ok) {
				return;
			}
			setCopied(true);
			clearTimeout(resetTimer.current);
			resetTimer.current = setTimeout(() => setCopied(false), 1200);
		});
	};

	return (
		<span className="flex min-w-0 items-center gap-2">
			<input
				type="text"
				readOnly
				value={value}
				aria-label={ariaLabel}
				spellCheck={false}
				onFocus={event => event.target.select()}
				className="h-8 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2.5 font-mono text-xs text-neutral-600 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-400"
			/>
			{/* Visible text is the label ("Copy"/"Copied"). A tooltip would
			    only repeat it. */}
			<button
				type="button"
				onClick={copy}
				className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-neutral-200 px-2.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800"
			>
				{copied ? (
					<CheckIcon width={13} height={13} />
				) : (
					<CopyIcon width={13} height={13} />
				)}
				{copied ? "Copied" : "Copy"}
			</button>
		</span>
	);
}
