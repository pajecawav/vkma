import { Autocomplete as BaseAutocomplete } from "@base-ui/react/autocomplete";
import { useMemo, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

export interface EventNameFieldProps extends Pick<
	ComponentPropsWithoutRef<"input">,
	"id" | "placeholder"
> {
	/** Suggested event names — the bridge catalogue merged with what the session has seen. */
	events: readonly string[];
	/** The raw input value; arbitrary names stay sendable, suggestions are advisory. */
	value: string;
	onValueChange: (value: string) => void;
	/** A suggestion was picked from the popup — distinct from typing the same text. */
	onPick?: (value: string) => void;
	ariaLabel?: string;
	className?: string;
}

/**
 * An event-name input with suggestion popup, built on Base UI's Autocomplete.
 * The list filters as the user types (case-insensitive substring) and is
 * advisory only: the input is free text, since execute accepts any bridge
 * event name — including custom ones the catalogue has never heard of.
 * The popup mirrors ClientSelect's chrome, so the two dropdowns read as one
 * design system.
 */
export function EventNameField({
	events,
	value,
	onValueChange,
	onPick,
	ariaLabel,
	className,
	id,
	placeholder,
}: EventNameFieldProps) {
	// The matches are computed here so the popup can stay CLOSED while
	// nothing matches — an empty suggestion list is noise, not information.
	// (ASCII identifiers only, so `includes` agrees with the collator filter
	// Base UI would have applied.) The pool dedupes: merged catalogue
	// tables (methods ∪ receive events) legitimately repeat a name, and
	// duplicate React keys here accumulate stale option nodes.
	const known = useMemo(() => [...new Set(events)], [events]);
	const query = value.trim().toLowerCase();
	const matches = useMemo(
		() =>
			query === "" ? [...known] : known.filter(name => name.toLowerCase().includes(query)),
		[known, query],
	);
	const [open, setOpen] = useState(false);

	return (
		<BaseAutocomplete.Root
			items={known}
			filteredItems={matches}
			open={open && matches.length > 0}
			onOpenChange={setOpen}
			value={value}
			onValueChange={(next, details) => {
				onValueChange(next);
				if (details?.reason === "item-press") {
					onPick?.(next);
				}
			}}
			// No auto-highlight: Enter with no deliberate pick must not silently
			// rewrite the name the user typed.
			autoHighlight={false}
			openOnInputClick
		>
			<BaseAutocomplete.Input
				id={id}
				aria-label={ariaLabel}
				placeholder={placeholder}
				spellCheck={false}
				className={`h-8 w-full rounded-md border border-neutral-200 bg-white px-2.5 font-mono text-sm text-neutral-800 outline-none focus-visible:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 ${className ?? ""}`}
			/>
			<BaseAutocomplete.Portal>
				{/* Left-aligned with the input; the popup hugs the query — at
				    least the input's width, at most the space available. */}
				<BaseAutocomplete.Positioner align="start" sideOffset={4} className="z-50">
					{/* max-h = popup inset (2×2px) + exactly 10 rows of 28px
					    (text-sm line-height 20 + py-1), so the scroll never cuts
					    a half row into a stray gap at the bottom. */}
					<BaseAutocomplete.Popup className="scroll-area z-50 max-h-[284px] w-max min-w-(--anchor-width) max-w-(--available-width) overflow-y-auto rounded-md bg-white py-0.5 shadow-lg ring-1 ring-neutral-200 outline-none dark:bg-neutral-900 dark:ring-neutral-800">
						<BaseAutocomplete.List>
							{(name: string) => (
								<BaseAutocomplete.Item
									key={name}
									value={name}
									className="block cursor-pointer truncate rounded-[4px] px-2 py-1 font-mono text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[highlighted]:text-neutral-900 dark:text-neutral-300 dark:data-[highlighted]:bg-neutral-800 dark:data-[highlighted]:text-neutral-100"
								>
									{name}
								</BaseAutocomplete.Item>
							)}
						</BaseAutocomplete.List>
					</BaseAutocomplete.Popup>
				</BaseAutocomplete.Positioner>
			</BaseAutocomplete.Portal>
		</BaseAutocomplete.Root>
	);
}
