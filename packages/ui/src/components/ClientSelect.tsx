import { Select as BaseSelect } from "@base-ui/react/select";
import type { ClientInfo } from "@vkma.dev/protocol";
import { clientColor } from "../lib/colors.ts";
import { platformLabel, shortId } from "../lib/format.ts";
import { CheckIcon, ChevronIcon } from "./icons.tsx";

interface Option {
	value: string;
	label: string;
	/** When set, the option (and the trigger) carries the client's color dot. */
	clientId?: string;
}

export interface ClientSelectProps {
	clients: readonly ClientInfo[];
	value: string;
	onValueChange: (value: string) => void;
	/** Prepended without a color dot — the timeline's "All clients". */
	allValue?: { value: string; label: string };
	/** Filter-row compact (h-7) vs form-field (h-8). */
	size?: "sm" | "md";
	ariaLabel?: string;
	title?: string;
	className?: string;
}

function clientLabel(client: ClientInfo): string {
	return `${platformLabel(client.platform)} · ${shortId(client.clientId)}`;
}

/**
 * A client picker in panel chrome: every client carries its deterministic
 * color dot — same palette as the timeline badges — in both the trigger and
 * the popup. Built on Base UI's Select, so listbox semantics (keyboard,
 * typeahead, focus) come with it; the popup aligns with the trigger the way
 * a native select's list does.
 */
export function ClientSelect({
	clients,
	value,
	onValueChange,
	allValue,
	size = "md",
	ariaLabel,
	title,
	className,
}: ClientSelectProps) {
	const options: Option[] = [
		...(allValue ? [{ value: allValue.value, label: allValue.label }] : []),
		...clients.map(client => ({
			value: client.clientId,
			label: clientLabel(client),
			clientId: client.clientId,
		})),
	];
	const selected = options.find(option => option.value === value);

	const triggerSize =
		size === "sm" ? "h-7 gap-2 rounded-md px-2 text-xs" : "h-8 gap-2 rounded-md px-2 text-sm";
	const itemSize = size === "sm" ? "text-xs" : "text-sm";

	return (
		<BaseSelect.Root
			value={value}
			onValueChange={next => {
				// The panel's contract is plain strings; base-ui types the
				// callback as nullable (deselect), which a single-value picker
				// never exercises — every option above is non-null.
				if (next !== null) {
					onValueChange(next);
				}
			}}
		>
			<BaseSelect.Trigger
				aria-label={ariaLabel}
				title={title}
				className={`flex min-w-0 cursor-pointer items-center rounded-md border border-neutral-200 bg-white text-left text-neutral-800 outline-none focus-visible:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 ${triggerSize} ${className ?? ""}`}
			>
				{/* The dot slot is always reserved: alignItemWithTrigger aligns
				    the selected item's text with the Value's edge, so the chain
				    [padding][dot][gap] must be identical in the trigger and the
				    items — otherwise the popup shifts horizontally. */}
				<span
					aria-hidden="true"
					className={`size-1.5 shrink-0 rounded-[2px] ${selected?.clientId === undefined ? "bg-transparent" : clientColor(selected.clientId).dot}`}
				/>
				<BaseSelect.Value className="min-w-0 flex-1 truncate">
					{selected?.label}
				</BaseSelect.Value>
				<BaseSelect.Icon aria-hidden="true" className="shrink-0 text-neutral-400">
					<ChevronIcon width={12} height={12} className="rotate-90" />
				</BaseSelect.Icon>
			</BaseSelect.Trigger>
			<BaseSelect.Portal>
				<BaseSelect.Positioner alignItemWithTrigger className="z-50">
					<BaseSelect.Popup className="scroll-area z-50 max-h-72 min-w-(--positioner-width) overflow-y-auto rounded-md bg-white py-0.5 shadow-lg ring-1 ring-neutral-200 outline-none dark:bg-neutral-900 dark:ring-neutral-800">
						<BaseSelect.List>
							{options.map(option => (
								<BaseSelect.Item
									key={option.value}
									value={option.value}
									className={`flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1 text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[highlighted]:text-neutral-900 dark:text-neutral-300 dark:data-[highlighted]:bg-neutral-800 dark:data-[highlighted]:text-neutral-100 ${itemSize}`}
								>
									<span
										aria-hidden="true"
										className={`size-1.5 shrink-0 rounded-[2px] ${option.clientId === undefined ? "bg-transparent" : clientColor(option.clientId).dot}`}
									/>
									<BaseSelect.ItemText className="min-w-0 flex-1 truncate">
										{option.label}
									</BaseSelect.ItemText>
									<BaseSelect.ItemIndicator className="shrink-0 text-neutral-500 dark:text-neutral-400">
										<CheckIcon width={12} height={12} />
									</BaseSelect.ItemIndicator>
								</BaseSelect.Item>
							))}
						</BaseSelect.List>
					</BaseSelect.Popup>
				</BaseSelect.Positioner>
			</BaseSelect.Portal>
		</BaseSelect.Root>
	);
}
