import { clientColor } from "../lib/colors.ts";

/**
 * The client's color square — the deterministic palette tone that marks
 * this client everywhere (timeline badges, client cards, approvals).
 */
export function ClientDot({ clientId, className = "" }: { clientId: string; className?: string }) {
	return (
		<span
			className={`size-1.5 rounded-[2px] ${clientColor(clientId).dot} ${className}`}
			aria-hidden="true"
		/>
	);
}
