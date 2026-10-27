import type { ConnectionStatus } from "@vkma.dev/protocol";
import type { ReactNode } from "react";

/**
 * The one color semantics of connection states — dot + tone per status.
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

/** The status row: colored dot + label, with an optional muted tail. */
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
	return (
		<span className="flex items-center gap-2 text-xs" title={title ?? `RPC: ${meta.label}`}>
			<span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
			<span className={meta.text}>{label ?? meta.label}</span>
			{extra !== undefined && <span className="text-neutral-400">{extra}</span>}
		</span>
	);
}
