import { useState } from "react";
import {
	DEFAULT_IGNORED_EVENTS,
	ignoreName,
	type IgnoredEventsSettings,
} from "../lib/ignored-events.ts";
import { Button } from "./Button.tsx";
import { EventNameField } from "./EventNameField.tsx";
import { CrossIcon } from "./icons.tsx";
import { Switch } from "./Switch.tsx";

export interface IgnoredEventsEditorProps {
	settings: IgnoredEventsSettings;
	onChange: (next: IgnoredEventsSettings) => void;
	/** The catalogue pool (request methods + receive events) for the add field. */
	suggestions: readonly string[];
}

/** A chip is one ignored name. Filled = hidden from the ledger; outlined =
 * visible. Mono because event names are data. */
function Chip({
	active,
	onClick,
	title,
	children,
}: {
	active: boolean;
	onClick: () => void;
	title: string;
	children: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] leading-none transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600 ${
				active
					? "bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900"
					: "border border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-200"
			}`}
		>
			<span className="truncate">{children}</span>
		</button>
	);
}

/**
 * The ignored-events editor — the popover card behind the timeline's
 * eye cluster. Presentational: the surface hands in the settings and a
 * persister (localStorage / chrome.storage), the editor only reshapes.
 * Defaults toggle in place (so a temporarily noisy debugging session can
 * surface `UpdateInsets` again without losing it forever); added names
 * remove on click; the add field accepts any name, catalogue-suggested
 * or free-form.
 */
export function IgnoredEventsEditor({ settings, onChange, suggestions }: IgnoredEventsEditorProps) {
	const [draft, setDraft] = useState("");

	const add = () => {
		onChange(ignoreName(settings, draft));
		setDraft("");
	};

	return (
		<div className="flex w-80 max-w-(--available-width) flex-col gap-3 p-3.5">
			<label className="flex cursor-pointer items-center justify-between gap-3">
				<span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
					Hide ignored events
				</span>
				<Switch
					checked={settings.enabled}
					onCheckedChange={enabled => onChange({ ...settings, enabled })}
					ariaLabel="Hide ignored events"
				/>
			</label>

			<section className="flex flex-col gap-1.5">
				<h3 className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
					Defaults
				</h3>
				<div className="flex flex-wrap gap-1.5">
					{DEFAULT_IGNORED_EVENTS.map(name => {
						const ignored = !settings.off.includes(name);
						return (
							<Chip
								key={name}
								active={ignored}
								title={ignored ? `Stop hiding ${name}` : `Hide ${name}`}
								onClick={() =>
									onChange({
										...settings,
										off: ignored
											? [...settings.off, name]
											: settings.off.filter(off => off !== name),
									})
								}
							>
								{name}
							</Chip>
						);
					})}
				</div>
			</section>

			<section className="flex flex-col gap-1.5">
				<h3 className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
					Added
				</h3>
				{settings.extra.length === 0 ? (
					<p className="text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
						Nothing added yet — ignore a row right from the timeline, or add a name
						below.
					</p>
				) : (
					<div className="flex flex-wrap gap-1.5">
						{settings.extra.map(name => (
							<span
								key={name}
								className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-neutral-800 px-2 py-1 font-mono text-[11px] leading-none text-white dark:bg-neutral-100 dark:text-neutral-900"
							>
								<span className="truncate">{name}</span>
								<button
									type="button"
									title={`Stop hiding ${name}`}
									onClick={() =>
										onChange({
											...settings,
											extra: settings.extra.filter(extra => extra !== name),
										})
									}
									className="-mr-0.5 grid size-3.5 shrink-0 cursor-pointer place-items-center rounded-[3px] text-neutral-400 hover:text-white dark:text-neutral-500 dark:hover:text-neutral-900"
								>
									<CrossIcon width={10} height={10} />
								</button>
							</span>
						))}
					</div>
				)}
			</section>

			{/* The form makes Enter commit the draft (Base UI lets Enter through
			    when nothing is highlighted); a catalogue pick commits at once. */}
			<form
				className="flex items-center gap-1.5"
				onSubmit={event => {
					event.preventDefault();
					add();
				}}
			>
				<EventNameField
					events={suggestions}
					value={draft}
					onValueChange={setDraft}
					onPick={name => {
						onChange(ignoreName(settings, name));
						setDraft("");
					}}
					ariaLabel="Event name to ignore"
					placeholder="Add an event name…"
					className="min-w-0 flex-1"
				/>
				<Button variant="outline" size="md" type="submit" disabled={draft.trim() === ""}>
					Add
				</Button>
			</form>

			<p className="border-t border-neutral-100 pt-2.5 text-[11px] leading-relaxed text-neutral-400 dark:border-neutral-800/60 dark:text-neutral-500">
				A hidden request takes its response with it; events hide one by one.
			</p>
		</div>
	);
}
