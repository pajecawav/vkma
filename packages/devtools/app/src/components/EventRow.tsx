import { memo, useState } from "react";
import type { ClientInfo, WireEvent } from "../../../src/shared/protocol.ts";
import { formatDuration, formatPayloadPreview, formatTime, shortId } from "../lib/format.ts";
import { ArrowInIcon, ArrowOutIcon, CheckIcon, CopyIcon, CrossIcon } from "./icons.tsx";

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
		<span className="inline-flex items-center gap-1 text-[10px] leading-none text-neutral-500 dark:text-neutral-400">
			<span
				className={`size-1.5 rounded-[2px] ${CLIENT_SHADES[shadeIndex % CLIENT_SHADES.length]}`}
				aria-hidden="true"
			/>
			{client ? shortId(clientId) : "unknown"}
		</span>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			className="grid size-6 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
			title="Copy JSON"
			onClick={event => {
				event.stopPropagation();
				void navigator.clipboard?.writeText(text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				});
			}}
		>
			{copied ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
		</button>
	);
}

interface EventRowProps {
	event: WireEvent;
	clients: ClientInfo[];
	clientShade: (clientId: string) => number;
	/** ts of the paired send, for response duration. */
	pairedSendTs?: number;
	animate: boolean;
}

export const EventRow = memo(function EventRow({
	event,
	clients,
	clientShade,
	pairedSendTs,
	animate,
}: EventRowProps) {
	const [open, setOpen] = useState(false);
	const isOut = event.direction === "out";
	const isError = event.kind === "response" && event.ok === false;

	return (
		<div
			className={`row-pad flex w-full ${isOut ? "justify-end" : "justify-start"} ${animate ? "row-in" : ""}`}
		>
			<div
				className={`w-full sm:w-[calc(50%-14px)] ${isOut ? "sm:pr-0.5 text-right items-end" : "sm:pl-0.5 items-start"} flex flex-col gap-0.5 px-3 py-1.5`}
			>
				<button
					type="button"
					onClick={() => setOpen(value => !value)}
					className="group block w-full text-left cursor-pointer"
					aria-expanded={open}
				>
					<span className={`flex items-center gap-2 ${isOut ? "flex-row-reverse" : ""}`}>
						<time
							className="font-mono text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400"
							dateTime={new Date(event.ts).toISOString()}
						>
							{formatTime(event.ts)}
						</time>
						<ClientBadge
							clientId={event.clientId}
							clients={clients}
							shadeIndex={clientShade(event.clientId)}
						/>
						{event.kind === "response" && pairedSendTs !== undefined && (
							<span className="font-mono text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
								↳ {formatDuration(pairedSendTs, event.ts)}
							</span>
						)}
					</span>
					<span
						className={`mt-0.5 flex items-center gap-1.5 ${isOut ? "flex-row-reverse" : ""}`}
					>
						<span
							className={`grid size-4 shrink-0 place-items-center rounded-[4px] ${
								isError
									? "bg-red-500/10 text-red-600 dark:text-red-400"
									: isOut
										? "bg-neutral-800/[0.06] text-neutral-500 dark:bg-neutral-100/10 dark:text-neutral-400"
										: "bg-neutral-800/[0.06] text-neutral-500 dark:bg-neutral-100/10 dark:text-neutral-400"
							}`}
							title={
								isOut
									? "outgoing send"
									: event.kind === "response"
										? "response"
										: "incoming event"
							}
						>
							{isOut ? (
								<ArrowOutIcon width={11} height={11} />
							) : (
								<ArrowInIcon width={11} height={11} />
							)}
						</span>
						<span className="truncate font-mono text-xs font-medium text-neutral-800 dark:text-neutral-200">
							{event.name}
						</span>
						{isError && (
							<CrossIcon width={12} height={12} className="shrink-0 text-red-500" />
						)}
						{event.ok === true && (
							<CheckIcon
								width={12}
								height={12}
								className="shrink-0 text-emerald-500"
							/>
						)}
					</span>
					{!open && (
						<span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
							{formatPayloadPreview(event.payload)}
						</span>
					)}
				</button>
				{open && (
					<div
						className={`flex w-full max-w-full items-start gap-1 ${isOut ? "flex-row-reverse" : ""}`}
					>
						<CopyButton text={JSON.stringify(event.payload ?? null, null, "\t")} />
						<pre className="scroll-area max-h-64 w-full min-w-0 overflow-auto rounded-md border border-neutral-200 bg-white p-2.5 text-left font-mono text-[11px] leading-relaxed text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
							{JSON.stringify(event.payload ?? null, null, "\t")}
						</pre>
					</div>
				)}
			</div>
		</div>
	);
});
