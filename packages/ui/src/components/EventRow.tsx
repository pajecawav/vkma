import type { ClientInfo, WireEvent } from "@vkma.dev/protocol";
import { memo, useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard.ts";
import { clientColor } from "../lib/colors.ts";
import { formatDuration, formatPayloadPreview, formatTime, shortId } from "../lib/format.ts";
import { scrubUrl } from "../lib/sensitive.ts";
import { ClientDot } from "./ClientDot.tsx";
import { IconButton } from "./IconButton.tsx";
import { ArrowOutIcon, CheckIcon, CopyIcon, CrossIcon, DiamondIcon } from "./icons.tsx";
import { JsonTree } from "./JsonTree.tsx";
import { Tooltip } from "./Tooltip.tsx";

function ClientBadge({ clientId, clients }: { clientId: string; clients: ClientInfo[] }) {
	const client = clients.find(c => c.clientId === clientId);
	return (
		<span
			className={`inline-flex shrink-0 items-center gap-1 font-mono text-[11px] leading-none ${clientColor(clientId).text}`}
			title={client ? scrubUrl(client.url) : "client disconnected"}
		>
			<ClientDot clientId={clientId} />
			{shortId(clientId)}
		</span>
	);
}

/** Remote ts is foreign input: an out-of-range value must degrade to an
 * absent attribute, never throw `RangeError: Invalid time value` through
 * the render (one hostile row would unmount the whole panel tree). */
const ISO_MAX = 8.64e15;
const isoDateTime = (ts: number): string | undefined =>
	Number.isFinite(ts) && Math.abs(ts) <= ISO_MAX ? new Date(ts).toISOString() : undefined;

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	// the "copied" flash outlives the row's unmount otherwise
	useEffect(() => () => clearTimeout(resetTimer.current), []);

	const copy = (event: React.MouseEvent) => {
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
		<IconButton size="sm" label="Copy JSON" onClick={copy}>
			{copied ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
		</IconButton>
	);
}

/** Small type chip: → request, ↳ response, ◇ event. Lives in every
 * timeline row, so its hint waits longer than the shared 200ms — the
 * pointer sweeps whole stacks of these in one move. */
function KindChip({ kind, title }: { kind: "request" | "response" | "event"; title: string }) {
	return (
		<Tooltip content={title} delay={600}>
			<span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-neutral-800/[0.06] text-neutral-500 dark:bg-neutral-100/10 dark:text-neutral-400">
				{kind === "request" && <ArrowOutIcon width={11} height={11} />}
				{kind === "response" && (
					<svg
						viewBox="0 0 24 24"
						width={11}
						height={11}
						fill="none"
						stroke="currentColor"
						strokeWidth="1.75"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M9 15 4 10l5-5" />
						<path d="M4 10h9a7 7 0 0 1 7 7v3" />
					</svg>
				)}
				{kind === "event" && <DiamondIcon width={10} height={10} />}
			</span>
		</Tooltip>
	);
}

interface RowProps {
	event: WireEvent;
	clients: ClientInfo[];
	/** Embedded mode: every row belongs to the panel's own client. */
	hideClient?: boolean;
	/** Response-only: timestamp of the paired request. */
	requestTs?: number;
	animate: boolean;
	indent?: boolean;
}

const EventRow = memo(function Row({
	event,
	clients,
	hideClient,
	requestTs,
	animate,
	indent,
}: RowProps) {
	const [open, setOpen] = useState(false);
	const kind: "request" | "response" | "event" =
		event.kind === "send" ? "request" : event.kind === "response" ? "response" : "event";
	const isError = event.kind === "response" && event.ok === false;
	const isOkResponse = event.kind === "response" && event.ok === true;

	return (
		<div data-seq={event.seq} className={`${indent ? "pl-9" : ""} ${animate ? "row-in" : ""}`}>
			<button
				type="button"
				onClick={() => {
					setOpen(value => !value);
				}}
				aria-expanded={open}
				className="group flex h-7 w-full items-center gap-2 px-3 text-left hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40"
			>
				<time
					className="shrink-0 font-mono text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400"
					dateTime={isoDateTime(event.ts)}
				>
					{formatTime(event.ts)}
				</time>
				{!hideClient && <ClientBadge clientId={event.clientId} clients={clients} />}
				<KindChip
					kind={kind}
					title={
						kind === "request"
							? "request (app → VK)"
							: kind === "response"
								? "response (VK → app)"
								: "event (VK → app)"
					}
				/>
				<span
					className={`min-w-0 truncate font-mono text-[13px] ${isError ? "text-red-600 dark:text-red-400" : "text-neutral-800 dark:text-neutral-200"}`}
				>
					{event.name}
				</span>
				{requestTs !== undefined && (
					<span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
						{formatDuration(requestTs, event.ts)}
					</span>
				)}
				{isOkResponse && (
					<CheckIcon width={12} height={12} className="shrink-0 text-emerald-500" />
				)}
				{isError && <CrossIcon width={12} height={12} className="shrink-0 text-red-500" />}
				<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
					{formatPayloadPreview(event.payload)}
				</span>
			</button>
			{open && (
				<div className="flex items-start gap-1 px-3 pb-2 pl-9">
					<CopyButton text={JSON.stringify(event.payload ?? null, null, "\t")} />
					<div className="scroll-area max-h-64 w-full min-w-0 overflow-auto rounded-md border border-neutral-200 bg-white px-2 py-1 text-left dark:border-neutral-800 dark:bg-neutral-900">
						<JsonTree value={event.payload} />
					</div>
				</div>
			)}
		</div>
	);
});

export interface RequestGroupProps {
	request: WireEvent;
	response?: WireEvent;
	clients: ClientInfo[];
	hideClient?: boolean;
	animate: boolean;
}

/** A request and its paired response, rendered as one unit. */
export const RequestGroup = memo(function RequestGroup({
	request,
	response,
	clients,
	hideClient,
	animate,
}: RequestGroupProps) {
	return (
		<div className={animate ? "row-in" : undefined}>
			<EventRow event={request} clients={clients} hideClient={hideClient} animate={false} />
			{response && (
				<EventRow
					event={response}
					clients={clients}
					hideClient={hideClient}
					requestTs={request.ts}
					animate={false}
					indent
				/>
			)}
		</div>
	);
});

export { EventRow };
