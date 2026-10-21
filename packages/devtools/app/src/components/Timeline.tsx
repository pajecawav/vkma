import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClientInfo, WireEvent } from "../../../src/shared/protocol.ts";
import { EventRow } from "./EventRow.tsx";
import { PauseIcon, PlayIcon, TrashIcon } from "./icons.tsx";

type DirectionFilter = "all" | "in" | "out";

const DIRECTION_TABS: { id: DirectionFilter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "in", label: "In" },
	{ id: "out", label: "Out" },
];

export function Timeline({ events, clients }: { events: WireEvent[]; clients: ClientInfo[] }) {
	const [query, setQuery] = useState("");
	const [direction, setDirection] = useState<DirectionFilter>("all");
	const [paused, setPaused] = useState(false);
	const [anchorSeq, setAnchorSeq] = useState<number | null>(null);
	const [clearSeq, setClearSeq] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);
	const pinnedRef = useRef(true);

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
		const needle = query.trim().toLowerCase();
		return frozen.filter(event => {
			if (direction !== "all" && event.direction !== direction) {
				return false;
			}
			if (needle !== "" && !event.name.toLowerCase().includes(needle)) {
				return false;
			}
			return true;
		});
	}, [events, clearSeq, paused, anchorSeq, query, direction]);

	const buffered =
		paused && anchorSeq !== null
			? events.filter(event => event.seq > anchorSeq && event.seq > clearSeq).length
			: 0;

	// Map for send→response pairing (duration display).
	const pairMap = useMemo(() => {
		const map = new Map<string, number>();
		for (const event of events) {
			if (event.kind === "send") {
				map.set(`${event.clientId}:${event.id}`, event.ts);
			}
		}
		return map;
	}, [events]);

	const clientShade = useMemo(() => {
		const shades = new Map<string, number>();
		for (const client of clients) {
			shades.set(client.clientId, shades.size);
		}
		return (clientId: string) => shades.get(clientId) ?? 0;
	}, [clients]);

	const initialMaxSeq = useRef<number | null>(null);
	if (initialMaxSeq.current === null && events.length > 0) {
		initialMaxSeq.current = maxSeq;
	}

	// Follow the newest row while the user is pinned to the bottom.
	useLayoutEffect(() => {
		const list = listRef.current;
		if (list && pinnedRef.current && !paused) {
			list.scrollTop = list.scrollHeight;
		}
	});

	const empty = visible.length === 0 && query === "" && direction === "all" && buffered === 0;

	return (
		<section className="flex min-h-0 flex-1 flex-col" aria-label="Timeline">
			<div className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 dark:border-neutral-800">
				<input
					type="search"
					value={query}
					onChange={event => setQuery(event.target.value)}
					placeholder="Filter by event name…"
					className="h-7 w-40 min-w-0 rounded-md border border-neutral-200 bg-white px-2.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 sm:w-56 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder:text-neutral-500"
				/>
				<div
					className="flex h-7 items-center rounded-md border border-neutral-200 p-0.5 dark:border-neutral-800"
					role="tablist"
					aria-label="Direction"
				>
					{DIRECTION_TABS.map(tab => (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={direction === tab.id}
							onClick={() => setDirection(tab.id)}
							className={`h-6 rounded-[4px] px-2.5 text-xs font-medium ${
								direction === tab.id
									? "bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900"
									: "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>
				<div className="ml-auto flex items-center gap-1">
					{paused && buffered > 0 && (
						<button
							type="button"
							onClick={() => setPaused(false)}
							className="h-7 rounded-md bg-neutral-800 px-2.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
						>
							{buffered} new — resume
						</button>
					)}
					<button
						type="button"
						onClick={() => setPaused(value => !value)}
						aria-pressed={paused}
						title={paused ? "Resume live tail" : "Pause live tail"}
						className={`grid size-7 place-items-center rounded-md ${
							paused
								? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
								: "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
						}`}
					>
						{paused ? (
							<PlayIcon width={14} height={14} />
						) : (
							<PauseIcon width={14} height={14} />
						)}
					</button>
					<button
						type="button"
						title="Clear timeline"
						onClick={() => setClearSeq(maxSeq)}
						className="grid size-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
					>
						<TrashIcon width={14} height={14} />
					</button>
				</div>
			</div>

			<div
				ref={listRef}
				onScroll={event => {
					const list = event.currentTarget;
					pinnedRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
				}}
				className="scroll-area relative min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800/60"
			>
				{/* the dialogue axis: one hairline the timeline speaks across */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-neutral-200 sm:block dark:bg-neutral-800"
				/>
				{empty ? (
					<div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 text-center">
						<p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
							Waiting for bridge traffic
						</p>
						<p className="max-w-64 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
							Open your mini app — every send and event lands here. Nothing yet? Make
							sure the app imports <code className="font-mono">@vkma.dev/bridge</code>
							.
						</p>
					</div>
				) : (
					<>
						{visible.map(event => (
							<EventRow
								key={event.seq}
								event={event}
								clients={clients}
								clientShade={clientShade}
								pairedSendTs={
									event.reqId !== undefined
										? pairMap.get(`${event.clientId}:${event.reqId}`)
										: undefined
								}
								animate={
									initialMaxSeq.current !== null &&
									event.seq > initialMaxSeq.current
								}
							/>
						))}
						{visible.length === 0 && (
							<p className="px-4 py-8 text-center text-xs text-neutral-400">
								No events match the filter.
							</p>
						)}
					</>
				)}
			</div>
		</section>
	);
}
