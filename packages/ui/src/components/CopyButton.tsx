import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { copyText } from "../lib/clipboard.ts";
import { IconButton } from "./IconButton.tsx";
import { CheckIcon, CopyIcon } from "./icons.tsx";

export interface CopyButtonProps {
	/** The exact text that lands on the clipboard. */
	text: string;
	/** Accessible name and hover hint. It names what is copied, so a
	 * caller handing over unmasked values says so here. */
	label: string;
	className?: string;
}

/**
 * An icon-only copy action for dense rows and cards: puts `text` on the
 * clipboard verbatim and swaps the glyph for a check for a beat.
 */
export function CopyButton({ text, label, className }: CopyButtonProps) {
	const [copied, setCopied] = useState(false);
	const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	// the "copied" flash outlives the component's unmount otherwise
	useEffect(() => () => clearTimeout(resetTimer.current), []);

	const copy = (event: MouseEvent) => {
		// the same contract as the ignore action next to it: a click on a
		// row's action never reaches the row's toggle
		event.stopPropagation();
		void copyText(text).then(ok => {
			if (!ok) {
				return;
			}
			setCopied(true);
			clearTimeout(resetTimer.current);
			resetTimer.current = setTimeout(() => setCopied(false), 1200);
		});
	};

	return (
		<IconButton size="sm" label={label} onClick={copy} className={className}>
			{copied ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
		</IconButton>
	);
}
