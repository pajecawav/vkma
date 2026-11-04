import type { ConnectionStatus } from "@vkma.dev/protocol";
import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";

/**
 * The one color semantics of connection states, dot + tone per status.
 * Every surface that renders a status line reads from here, so the
 * colors cannot drift between panels.
 */
export const STATUS_META: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
	connecting: { label: "Connecting", dot: "bg-neutral-400", text: "text-neutral-500" },
	connected: { label: "Connected", dot: "bg-emerald-500", text: "text-neutral-500" },
	unauthorized: {
		label: "Not authorized",
		dot: "bg-amber-500",
		text: "text-amber-600 dark:text-amber-400",
	},
	disconnected: {
		label: "Disconnected",
		dot: "bg-neutral-300 dark:bg-neutral-600",
		text: "text-neutral-500",
	},
	error: { label: "Connection error", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
};

/**
 * The status row: colored dot + label, with an optional muted tail.
 * The `title` hint rides a Tooltip (the shared delay profile applies);
 * without it the row renders bare. A default hint would only repeat
 * the visible label.
 */
export function StatusLine({
	status,
	label,
	extra,
	title,
}: {
	status: ConnectionStatus;
	/** Overrides the status's default name. */
	label?: string;
	/** A muted tail after the label ("· WebRTC direct, no relays"). */
	extra?: ReactNode;
	title?: string;
}) {
	const meta = STATUS_META[status];
	// The hint only rides when it adds something. A bare `RPC: Connected`
	// over the visible "Connected" would be noise.
	return title === undefined ? (
		<span className="flex items-center gap-2 text-xs">
			<span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
			<span className={meta.text}>{label ?? meta.label}</span>
			{extra !== undefined && <span className="text-neutral-400">{extra}</span>}
		</span>
	) : (
		<Tooltip content={title}>
			<span className="flex items-center gap-2 text-xs">
				<span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
				<span className={meta.text}>{label ?? meta.label}</span>
				{extra !== undefined && <span className="text-neutral-400">{extra}</span>}
			</span>
		</Tooltip>
	);
}
