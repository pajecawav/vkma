import type { ClientInfo, WireEvent } from "@vkma.dev/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { compileNameFilter } from "../lib/name-filter.ts";
import { Button } from "./Button.tsx";
import { ClientSelect } from "./ClientSelect.tsx";
import { RequestGroup, EventRow } from "./EventRow.tsx";
import { IconButton } from "./IconButton.tsx";
import { PauseIcon, PlayIcon, TrashIcon } from "./icons.tsx";

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
}: {
	events: WireEvent[];
	clients: ClientInfo[];
	/** Embedded mode: rows always belong to this panel's client. */
	hideClient?: boolean;
	/** Overrides the "nothing yet" hint (surfaces with other capture modes). */
	emptyStateHint?: ReactNode;
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
	useEffect(() => {
		if (!paused) {
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

	const groups = useMemo(() => buildGroups(visible, filter), [visible, filter]);

	// Newest first: the ledger opens on the latest traffic. The scroll
	// container starts at the top, so no follow-the-bottom logic is needed.
	const ordered = useMemo(() => groups.toReversed(), [groups]);

	const buffered =
		paused && anchorSeq !== null
			? events.filter(event => event.seq > anchorSeq && event.seq > clearSeq).length
			: 0;

	const initialMaxSeq = useRef<number | null>(null);
	if (initialMaxSeq.current === null && events.length > 0) {
		initialMaxSeq.current = maxSeq;
	}

	const empty = ordered.length === 0 && query === "" && buffered === 0;

	// The filter chrome renders twice — a single row for wide containers and
	// a stacked variant for narrow ones (side panel, FAB iframe). Container
	// queries pick the visible copy; display:none keeps the hidden one out
	// of the a11y tree. The collapse point depends on whether the client
	// filter rides along: with it one row needs ~576px, without — ~384px.
	// The select also stays rendered while a non-`all` filter is active
	// even with a single client left — otherwise the filter would pin the
	// feed to a departed client with no control to reset it.
	const showClientFilter = !hideClient && (clients.length > 1 || clientFilter !== "all");
	const search = (className: string) => (
		<input
			type="search"
			value={query}
			onChange={event => setQuery(event.target.value)}
			placeholder="Filter by event name…"
			title="Case-insensitive; accepts regex (foo|bar, Get.*Info)"
			className={`h-7 rounded-md border border-neutral-200 bg-white px-2.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder:text-neutral-500 ${className}`}
		/>
	);
	const clientSelect = (className: string) => (
		<ClientSelect
			size="sm"
			className={className}
			ariaLabel="Client"
			title="Show events of one client"
			clients={clients}
			value={clientFilter}
			onValueChange={setClientFilter}
			allValue={{ value: "all", label: "All clients" }}
		/>
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
									animate={
										initialMaxSeq.current !== null &&
										group.head.seq > initialMaxSeq.current
									}
								/>
							) : (
								<EventRow
									event={group.head}
									clients={clients}
									hideClient={hideClient}
									animate={
										initialMaxSeq.current !== null &&
										group.head.seq > initialMaxSeq.current
									}
								/>
							)}
						</div>
					))
				)}
			</div>
		</section>
	);
}
