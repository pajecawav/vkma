import type { ClientStatus } from "@vkma.dev/protocol";
import { useState } from "react";
import type { ReactNode } from "react";
import { clientColor } from "../lib/colors.ts";
import { platformLabel, relativeTime, shortId } from "../lib/format.ts";
import { ChevronIcon, CrossIcon, PlatformIcon, WarningIcon } from "./icons.tsx";

const SENSITIVE_PARAMS = new Set(["sign", "access_token", "auth_key", "sid"]);

function LaunchParams({ params }: { params: Record<string, string> }) {
	const entries = Object.entries(params).toSorted(([a], [b]) => a.localeCompare(b));
	if (entries.length === 0) {
		return (
			<p className="px-9 py-2 text-xs text-neutral-400">
				No launch params on this page (standalone run).
			</p>
		);
	}
	return (
		<dl className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-4 gap-y-1 px-9 py-2">
			{entries.map(([key, value]) => (
				<div key={key} className="col-span-2 grid grid-cols-subgrid">
					<dt className="truncate font-mono text-[11px] text-neutral-400" title={key}>
						{key}
					</dt>
					<dd
						className={`break-all font-mono text-[11px] text-neutral-600 dark:text-neutral-300 ${
							SENSITIVE_PARAMS.has(key) ? "blur-sm" : ""
						}`}
						title={SENSITIVE_PARAMS.has(key) ? undefined : value}
					>
						{value}
					</dd>
				</div>
			))}
		</dl>
	);
}

function ClientCard({
	client,
	bridgeWarning,
	onDelete,
}: {
	client: ClientStatus;
	bridgeWarning?: ReactNode;
	onDelete?: (clientId: string) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<li
			className={`rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 ${
				client.online ? "" : "opacity-55"
			}`}
		>
			<button
				type="button"
				onClick={() => setOpen(value => !value)}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
			>
				<PlatformIcon platform={client.platform} className="shrink-0 text-neutral-400" />
				<span className="flex min-w-0 flex-col gap-0.5">
					<span className="flex items-center gap-2 text-sm font-medium">
						{platformLabel(client.platform)}
						<span
							className={`inline-flex items-center gap-1 font-mono text-[11px] font-normal ${clientColor(client.clientId).text}`}
							title={client.clientId}
						>
							<span
								className={`size-1.5 rounded-[2px] ${clientColor(client.clientId).dot}`}
								aria-hidden="true"
							/>
							{shortId(client.clientId)}
						</span>
						{!client.online && (
							<span className="rounded-[4px] bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium leading-none text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
								offline
							</span>
						)}
						{!client.bridge && (
							<WarningIcon width={13} height={13} className="text-amber-500" />
						)}
					</span>
					<span className="truncate text-xs text-neutral-400" title={client.url}>
						{client.url}
					</span>
				</span>
				<span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-neutral-400">
					{client.appId !== undefined && <span>app {client.appId}</span>}
					{relativeTime(client.connectedAt)}
					{onDelete && !client.online && (
						<button
							type="button"
							title="Remove this client from the registry (its timeline history stays)"
							onClick={event => {
								event.stopPropagation();
								onDelete(client.clientId);
							}}
							className="grid size-6 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
						>
							<CrossIcon width={12} height={12} />
						</button>
					)}
					<ChevronIcon
						width={13}
						height={13}
						className={`transition-transform ${open ? "rotate-90" : ""}`}
					/>
				</span>
			</button>
			{open && (
				<div className="border-t border-neutral-100 py-1.5 dark:border-neutral-800">
					{!client.bridge && (
						<p className="mx-3 mb-2 flex items-start gap-2 rounded-md bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
							<WarningIcon width={13} height={13} className="mt-0.5 shrink-0" />
							{bridgeWarning ?? (
								<>
									Bridge not detected: this page does not import @vkma.dev/bridge,
									so only launch params are reported.
								</>
							)}
						</p>
					)}
					<p
						className="truncate px-9 py-1 font-mono text-[11px] text-neutral-400"
						title={client.ua}
					>
						{client.ua}
					</p>
					<LaunchParams params={client.launchParams ?? {}} />
				</div>
			)}
		</li>
	);
}

export function Clients({
	clients,
	emptyState,
	bridgeWarning,
	onDeleteClient,
}: {
	clients: ClientStatus[];
	/** Overrides the "no clients" card (surfaces with other capture modes). */
	emptyState?: ReactNode;
	/** Overrides the bridge-not-detected warning for surfaces where a
	 * missing vkma bridge still means captured traffic (spy mode). */
	bridgeWarning?: ReactNode;
	/** Registry hygiene affordance: renders a per-card remove button for
	 * offline clients and a bulk "remove offline" action. Live clients are
	 * never deletable from here (a running collector re-registers within
	 * one heartbeat anyway). */
	onDeleteClient?: (clientId: string) => void;
}) {
	const offline = clients.filter(client => !client.online);
	return (
		<section
			className="scroll-area min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"
			aria-label="Clients"
		>
			<div className="mx-auto flex max-w-xl flex-col gap-2">
				{onDeleteClient && offline.length >= 2 && (
					<button
						type="button"
						onClick={() => {
							for (const client of offline) {
								onDeleteClient(client.clientId);
							}
						}}
						className="self-end rounded-md px-2 py-1 text-[11px] font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
					>
						Remove offline ({offline.length})
					</button>
				)}
				{clients.length === 0 ? (
					(emptyState ?? (
						<p className="rounded-lg border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
							No connected clients. Open the mini app served by this dev server —
							desktop tab or phone — and it appears here.
						</p>
					))
				) : (
					<ul className="flex flex-col gap-2">
						{clients.map(client => (
							<ClientCard
								key={client.clientId}
								client={client}
								bridgeWarning={bridgeWarning}
								onDelete={onDeleteClient}
							/>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
