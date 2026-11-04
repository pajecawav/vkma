import { Popover } from "@base-ui/react/popover";
import type { ClientInfo, WireEvent } from "@vkma.dev/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
	ignoreName,
	type IgnoredEventsSettings,
	resolveIgnoredNames,
} from "../lib/ignored-events.ts";
import { compileNameFilter } from "../lib/name-filter.ts";
import { Button } from "./Button.tsx";
import { ClientSelect } from "./ClientSelect.tsx";
import { RequestGroup, EventRow } from "./EventRow.tsx";
import { IconButton } from "./IconButton.tsx";
import { EyeOffIcon, PauseIcon, PlayIcon, Settings2Icon, TrashIcon } from "./icons.tsx";
import { IgnoredEventsEditor } from "./IgnoredEventsEditor.tsx";
import { Tooltip } from "./Tooltip.tsx";

type EventFilter = "all" | "requests" | "events";

const FILTER_TABS: { id: EventFilter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "requests", label: "Requests" },
	{ id: "events", label: "Events" },
];

interface Group {
	/** The leading row: a request, or a standalone event. */
	head: WireEvent;
	/** The paired response, when one arrived. */
	response?: WireEvent;
}

/** Everything the timeline needs to run the ignored-events feature. The
 * consumer owns the storage (localStorage / chrome.storage) and hands in
 * the settings plus a persister; the pool feeds the editor's suggestions. */
export interface IgnoredEventsControl {
	settings: IgnoredEventsSettings;
	onChange: (next: IgnoredEventsSettings) => void;
	/** Catalogue names for the editor's add field (methods + receive events). */
	suggestions: readonly string[];
}

/**
 * Streams flat tap events into display units: a send opens a request group
 * that the next matching response (same client, same tap id) joins;
 * anything else stands alone as an event row.
 */
function buildGroups(events: WireEvent[], filter: EventFilter): Group[] {
	const pendingResponses = new Map<string, WireEvent>();
	const groups: Group[] = [];

	for (const event of events) {
		if (event.kind === "send") {
			groups.push({ head: event });
			pendingResponses.set(`${event.clientId}:${event.id}`, event);
			continue;
		}
		if (event.kind === "response") {
			const key = `${event.clientId}:${event.reqId}`;
			const request = pendingResponses.get(key);
			if (request !== undefined) {
				// attach to the request's group: groups are pushed in order and
				// the request created the most recent unmatched group with this
				// client, so scan back (rarely more than a few).
				for (let i = groups.length - 1; i >= 0; i--) {
					const group = groups[i];
					if (
						group !== undefined &&
						group.head.id === request.id &&
						group.head.clientId === request.clientId
					) {
						group.response = event;
						break;
					}
				}
				pendingResponses.delete(key);
				continue;
			}
			// unpaired response: show it as its own row
			groups.push({ head: event });
			continue;
		}
		groups.push({ head: event });
	}

	if (filter === "requests") {
		return groups.filter(group => group.head.kind === "send");
	}
	if (filter === "events") {
		return groups.filter(group => group.head.kind === "event");
	}
	return groups;
}

export function Timeline({
	events,
	clients,
	hideClient = false,
	emptyStateHint,
	ignoredEvents,
}: {
	events: WireEvent[];
	clients: ClientInfo[];
	/** Embedded mode: rows always belong to this panel's client. */
	hideClient?: boolean;
	/** Overrides the "nothing yet" hint (surfaces with other capture modes). */
	emptyStateHint?: ReactNode;
	/** Enables the ignored-events eye cluster and the row-level ignore action. */
	ignoredEvents?: IgnoredEventsControl;
}) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<EventFilter>("all");
	/** `"all"` or a scoped clientId. */
	const [clientFilter, setClientFilter] = useState<string>("all");
	const [paused, setPaused] = useState(false);
	const [anchorSeq, setAnchorSeq] = useState<number | null>(null);
	const [clearSeq, setClearSeq] = useState(0);

	const maxSeq = events.length > 0 ? (events.at(-1)?.seq ?? 0) : 0;

	// When paused, freeze the view at the pause point; buffer the rest.
	// The freeze point is a pause-moment snapshot: it can only be taken at
	// the commit, never derived from props in render.
	useEffect(() => {
		if (!paused) {
			// eslint-disable-next-line react/set-state-in-effect
			setAnchorSeq(null);
			return;
		}
		setAnchorSeq(current => current ?? maxSeq);
	}, [paused, maxSeq]);

	const visible = useMemo(() => {
		const base = events.filter(event => event.seq > clearSeq);
		const frozen =
			paused && anchorSeq !== null ? base.filter(event => event.seq <= anchorSeq) : base;
		const matchesName = compileNameFilter(query);
		return frozen.filter(event => {
			if (clientFilter !== "all" && event.clientId !== clientFilter) {
				return false;
			}
			if (matchesName !== undefined && !matchesName(event.name)) {
				return false;
			}
			return true;
		});
	}, [events, clearSeq, paused, anchorSeq, query, clientFilter]);

	// The effective hide set, resolved from the settings slice only:
	// `onChange` lives on the same object and must never reshape the memo.
	const settings = ignoredEvents?.settings;
	const ignoredSet = useMemo(
		() =>
			settings !== undefined && settings.enabled ? resolveIgnoredNames(settings) : undefined,
		[settings],
	);

	const ignoreRow =
		ignoredEvents &&
		((name: string) => {
			ignoredEvents.onChange(ignoreName(ignoredEvents.settings, name));
		});

	const groups = useMemo(() => {
		const built = buildGroups(visible, filter);
		// Ignore on the group head: a hidden request takes its paired
		// response along, and an unpaired response hides by its own name.
		if (ignoredSet === undefined) {
			return built;
		}
		return built.filter(group => !ignoredSet.has(group.head.name.toLowerCase()));
	}, [visible, filter, ignoredSet]);

	// Newest first: the ledger opens on the latest traffic. The scroll
	// container starts at the top, so no follow-the-bottom logic is needed.
	const ordered = useMemo(() => groups.toReversed(), [groups]);

	const buffered =
		paused && anchorSeq !== null
			? events.filter(event => event.seq > anchorSeq && event.seq > clearSeq).length
			: 0;

	const initialMaxSeq = useRef<number | null>(null);
	// eslint-disable-next-line react/refs
	if (initialMaxSeq.current === null && events.length > 0) {
		// the ledger is set-once (first-paint baseline) by design
		// eslint-disable-next-line react/refs
		initialMaxSeq.current = maxSeq;
	}
	// render-read of the set-once ledger is deliberate: it is the freeze
	// baseline — groups with seq above it animate, the initial ones do not
	// eslint-disable-next-line react/refs
	const animateFloor: number | null = initialMaxSeq.current;

	const empty =
		ordered.length === 0 &&
		query === "" &&
		buffered === 0 &&
		// "Waiting" only when nothing is actually being filtered away: an
		// empty buffer or an inactive filter. Otherwise, the match-miss.
		(events.length === 0 || ignoredSet === undefined);

	// The filter chrome renders twice: a single row for wide containers and
	// a stacked variant for narrow ones (side panel, FAB iframe). Container
	// queries pick the visible copy; display:none keeps the hidden one out
	// of the a11y tree. The collapse point depends on whether the client
	// filter rides along: with it one row needs ~576px, without, ~384px.
	// The select also stays rendered while a non-`all` filter is active
	// even with a single client left. Otherwise the filter would pin the
	// feed to a departed client with no control to reset it.
	const showClientFilter = !hideClient && (clients.length > 1 || clientFilter !== "all");
	const search = (className: string) => (
		<Tooltip content="Case-insensitive; accepts regex (foo|bar, Get.*Info)">
			<input
				type="search"
				value={query}
				onChange={event => setQuery(event.target.value)}
				placeholder="Filter by event name…"
				aria-label="Filter by event name"
				className={`h-7 rounded-md border border-neutral-200 bg-white px-2.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder:text-neutral-500 ${className}`}
			/>
		</Tooltip>
	);
	const clientSelect = (className: string) => (
		<Tooltip content="Show events of one client">
			<ClientSelect
				size="sm"
				className={className}
				ariaLabel="Client"
				clients={clients}
				value={clientFilter}
				onValueChange={setClientFilter}
				allValue={{ value: "all", label: "All clients" }}
			/>
		</Tooltip>
	);
	const tabs = (
		<div
			className="flex h-7 shrink-0 items-center rounded-md border border-neutral-200 p-0.5 dark:border-neutral-800"
			role="tablist"
			aria-label="Event type"
		>
			{FILTER_TABS.map(tab => (
				<button
					key={tab.id}
					type="button"
					role="tab"
					aria-selected={filter === tab.id}
					onClick={() => setFilter(tab.id)}
					className={`h-6 rounded-[4px] px-2.5 text-xs font-medium ${
						filter === tab.id
							? "bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900"
							: "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
					}`}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
	const actions = (
		<div className="ml-auto flex shrink-0 items-center gap-1">
			{ignoredEvents && (
				<>
					<IconButton
						label={
							ignoredEvents.settings.enabled
								? "Show ignored events"
								: "Hide ignored events"
						}
						active={ignoredEvents.settings.enabled}
						onClick={() =>
							ignoredEvents.onChange({
								...ignoredEvents.settings,
								enabled: !ignoredEvents.settings.enabled,
							})
						}
					>
						<EyeOffIcon width={14} height={14} />
					</IconButton>
					<Popover.Root>
						<Popover.Trigger
							render={
								<IconButton label="Edit ignored events">
									<Settings2Icon width={14} height={14} />
								</IconButton>
							}
						/>
						<Popover.Portal>
							<Popover.Positioner
								align="end"
								sideOffset={6}
								collisionPadding={8}
								className="z-50"
							>
								<Popover.Popup className="z-50 rounded-lg bg-white shadow-lg ring-1 ring-neutral-200 outline-none transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none dark:bg-neutral-900 dark:ring-neutral-800 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 [transform-origin:var(--transform-origin)]">
									<Popover.Title className="sr-only">
										Ignored events
									</Popover.Title>
									<IgnoredEventsEditor
										settings={ignoredEvents.settings}
										onChange={ignoredEvents.onChange}
										suggestions={ignoredEvents.suggestions}
									/>
								</Popover.Popup>
							</Popover.Positioner>
						</Popover.Portal>
					</Popover.Root>
				</>
			)}
			{paused && buffered > 0 && (
				<Button variant="solid" size="sm" onClick={() => setPaused(false)}>
					{buffered} new — resume
				</Button>
			)}
			<IconButton
				label={paused ? "Resume live tail" : "Pause live tail"}
				onClick={() => setPaused(value => !value)}
				active={paused || undefined}
			>
				{paused ? (
					<PlayIcon width={14} height={14} />
				) : (
					<PauseIcon width={14} height={14} />
				)}
			</IconButton>
			<IconButton label="Clear timeline" onClick={() => setClearSeq(maxSeq)}>
				<TrashIcon width={14} height={14} />
			</IconButton>
		</div>
	);

	return (
		<section className="@container flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Timeline">
			<div
				className={`hidden h-11 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 dark:border-neutral-800 ${
					showClientFilter ? "@xl:flex" : "@sm:flex"
				}`}
			>
				{search("w-40 min-w-24 @2xl:w-56")}
				{showClientFilter && clientSelect("max-w-44")}
				{tabs}
				{actions}
			</div>
			<div
				className={`flex shrink-0 flex-col gap-1.5 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800 ${
					showClientFilter ? "@xl:hidden" : "@sm:hidden"
				}`}
			>
				{showClientFilter ? (
					<>
						<div className="flex items-center gap-2">
							{search("min-w-0 flex-1")}
							{actions}
						</div>
						<div className="flex min-w-0 items-center gap-2">
							{clientSelect("max-w-40")}
							{tabs}
						</div>
					</>
				) : (
					<>
						{search("min-w-0 flex-1")}
						<div className="flex items-center gap-2">
							{tabs}
							{actions}
						</div>
					</>
				)}
			</div>

			<div className="scroll-area relative min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto overflow-x-hidden dark:divide-neutral-800/60">
				{empty ? (
					<div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 text-center">
						<p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
							Waiting for bridge traffic
						</p>
						<p className="max-w-64 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
							{emptyStateHint ?? (
								<>
									Open your mini app — every request and event lands here. Nothing
									yet? Make sure the app imports{" "}
									<code className="font-mono">@vkma.dev/bridge</code>.
								</>
							)}
						</p>
					</div>
				) : groups.length === 0 ? (
					<p className="px-4 py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
						No events match the filter.
					</p>
				) : (
					// the ref-derived freeze baseline flows in via animateFloor
					// eslint-disable-next-line react/refs
					ordered.map(group => (
						<div
							key={`${group.head.runId}:${group.head.clientId}:${group.head.seq}`}
							className="py-0.5"
						>
							{group.head.kind === "send" ? (
								<RequestGroup
									request={group.head}
									response={group.response}
									clients={clients}
									hideClient={hideClient}
									onIgnore={ignoreRow}
									animate={animateFloor !== null && group.head.seq > animateFloor}
								/>
							) : (
								<EventRow
									event={group.head}
									clients={clients}
									hideClient={hideClient}
									onIgnore={ignoreRow}
									animate={animateFloor !== null && group.head.seq > animateFloor}
								/>
							)}
						</div>
					))
				)}
			</div>
		</section>
	);
}
