import { memo, useState } from "react";
import type { ClientInfo, WireEvent } from "../../../src/shared/protocol.ts";
import { formatDuration, formatPayloadPreview, formatTime, shortId } from "../lib/format.ts";
import { ArrowOutIcon, CheckIcon, CopyIcon, CrossIcon, DiamondIcon } from "./icons.tsx";
import { JsonTree } from "./JsonTree.tsx";

const CLIENT_SHADES = [
	"bg-neutral-400 dark:bg-neutral-500",
	"bg-neutral-600 dark:bg-neutral-300",
	"bg-neutral-800 dark:bg-neutral-100",
	"bg-neutral-300 dark:bg-neutral-700",
];

function ClientBadge({
	clientId,
	clients,
	shadeIndex,
}: {
	clientId: string;
	clients: ClientInfo[];
	shadeIndex: number;
}) {
	const client = clients.find(c => c.clientId === clientId);
	return (
		<span
			className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] leading-none text-neutral-400 dark:text-neutral-500"
			title={client ? client.url : "client disconnected"}
		>
			<span
				className={`size-1.5 rounded-[2px] ${CLIENT_SHADES[shadeIndex % CLIENT_SHADES.length]}`}
				aria-hidden="true"
			/>
			{shortId(clientId)}
		</span>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const copy = (event: React.MouseEvent) => {
		event.stopPropagation();
		const done = () => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		};
		// Inside the FAB iframe the async clipboard API can be unavailable
		// (unfocused document / missing permission policy) — fall back to a
		// hidden textarea + execCommand, which works in same-origin frames.
		const fallback = () => {
			const area = document.createElement("textarea");
			area.value = text;
			area.style.position = "fixed";
			area.style.opacity = "0";
			document.body.append(area);
			area.select();
			try {
				document.execCommand("copy");
				done();
			} catch {
				// give up quietly; the user can still select the raw JSON
			} finally {
				area.remove();
			}
		};
		if (navigator.clipboard?.writeText) {
			void navigator.clipboard.writeText(text).then(done, fallback);
		} else {
			fallback();
		}
	};

	return (
		<button
			type="button"
			className="grid size-6 shrink-0 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
			title="Copy JSON"
			onClick={copy}
		>
			{copied ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
		</button>
	);
}

/** Small type chip: → request, ↳ response, ◇ event. */
function KindChip({ kind, title }: { kind: "request" | "response" | "event"; title: string }) {
	return (
		<span
			className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-neutral-800/[0.06] text-neutral-500 dark:bg-neutral-100/10 dark:text-neutral-400"
			title={title}
		>
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
	);
}

interface RowProps {
	event: WireEvent;
	clients: ClientInfo[];
	clientShade: (clientId: string) => number;
	/** Response-only: timestamp of the paired request. */
	requestTs?: number;
	animate: boolean;
	indent?: boolean;
}

const EventRow = memo(function Row({
	event,
	clients,
	clientShade,
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
		<div className={`${indent ? "pl-9" : ""} ${animate ? "row-in" : ""}`}>
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
					dateTime={new Date(event.ts).toISOString()}
				>
					{formatTime(event.ts)}
				</time>
				<ClientBadge
					clientId={event.clientId}
					clients={clients}
					shadeIndex={clientShade(event.clientId)}
				/>
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
	clientShade: (clientId: string) => number;
	animate: boolean;
}

/** A request and its paired response, rendered as one unit. */
export const RequestGroup = memo(function RequestGroup({
	request,
	response,
	clients,
	clientShade,
	animate,
}: RequestGroupProps) {
	return (
		<div className={animate ? "row-in" : undefined}>
			<EventRow event={request} clients={clients} clientShade={clientShade} animate={false} />
			{response && (
				<EventRow
					event={response}
					clients={clients}
					clientShade={clientShade}
					requestTs={request.ts}
					animate={false}
					indent
				/>
			)}
		</div>
	);
});

export { EventRow };
