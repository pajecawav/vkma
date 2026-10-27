import type { CaptureMode, ClientStatus } from "@vkma.dev/protocol";
import {
	Button,
	Clients,
	ClientDot,
	Execute,
	GlobeIcon,
	Rail,
	Timeline,
	TopBar,
	UiProvider,
	type Section,
} from "@vkma.dev/ui";
import { platformLabel, shortId } from "@vkma.dev/ui";
import { useState } from "react";
import type { InspectRuntime } from "../host/runtime.ts";
import { useInspect, type InspectConnection } from "./connection.ts";
import { SetupPanel } from "./SetupPanel.tsx";

const SECTION_KEY = "vkma:section";

export function App({ runtime }: { runtime: InspectRuntime }) {
	return (
		<UiProvider>
			<PanelBody runtime={runtime} />
		</UiProvider>
	);
}

function PanelBody({ runtime }: { runtime: InspectRuntime }) {
	const connection = useInspect(runtime);
	// The setup sheet opens by default while nothing has connected yet —
	// the first-run flow IS "copy the snippet into your mini app".
	const [setupOpen, setSetupOpen] = useState(() => connection.clients.length === 0);

	return (
		<div className="flex h-dvh flex-col">
			<TopBar
				status={connection.status}
				onReconnect={connection.reconnect}
				capture={captureOf(connection.clients)}
				actions={
					<Button
						variant="outline"
						size="sm"
						onClick={() => setSetupOpen(true)}
						title="How to connect a mini app"
					>
						<GlobeIcon />
						Connect
					</Button>
				}
			/>
			{(connection.approvals.length > 0 || connection.status === "error") && (
				<div className="flex flex-col gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
					{connection.status === "error" && (
						<p className="text-xs leading-relaxed text-red-600 dark:text-red-400">
							{connection.lastError ?? "Signaling error."}{" "}
							<button
								type="button"
								onClick={connection.reconnect}
								className="font-medium underline underline-offset-2"
							>
								Retry
							</button>
						</p>
					)}
					{connection.approvals.map(request => (
						<ApprovalCard
							key={request.clientId}
							request={request}
							onApprove={connection.approve}
							onDeny={connection.deny}
						/>
					))}
				</div>
			)}
			<Sections connection={connection} />
			{setupOpen && (
				<SetupPanel connection={connection} onClose={() => setSetupOpen(false)} />
			)}
		</div>
	);
}

/** One pending connection: the gate parks it until the human answers. */
function ApprovalCard({
	request,
	onApprove,
	onDeny,
}: {
	request: InspectConnection["approvals"][number];
	onApprove: (clientId: string, remember: boolean) => void;
	onDeny: (clientId: string) => void;
}) {
	const info = request.info;
	const host = safeHost(info.url);
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
			<ClientDot clientId={info.clientId} />
			<span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
				{info.appId ? `app ${info.appId}` : "unknown app"}
				{host ? <span className="font-normal text-neutral-400"> · {host}</span> : null}
			</span>
			<span className="text-[11px] text-neutral-500">
				{platformLabel(info.platform)} · {shortId(info.clientId)}
			</span>
			<span className="ml-auto flex items-center gap-1.5">
				<Button variant="ghost" size="sm" onClick={() => onDeny(info.clientId)}>
					Deny
				</Button>
				<Button variant="outline" size="sm" onClick={() => onApprove(info.clientId, true)}>
					Always allow
				</Button>
				<Button variant="solid" size="sm" onClick={() => onApprove(info.clientId, false)}>
					Allow
				</Button>
			</span>
		</div>
	);
}

function safeHost(url: string): string | undefined {
	try {
		return new URL(url).host;
	} catch {
		return undefined;
	}
}

function captureOf(clients: ClientStatus[]): CaptureMode | undefined {
	if (clients.length === 0) {
		return undefined;
	}
	const first = clients[0].bridge;
	return clients.every(client => client.bridge === first)
		? first
			? "direct"
			: "spy"
		: undefined;
}

function Sections({ connection }: { connection: InspectConnection }) {
	const [section, setSection] = useState<Section>(() => {
		const stored = localStorage.getItem(SECTION_KEY);
		return stored === "execute" || stored === "clients" ? stored : "timeline";
	});

	// Sections stay mounted (display-none) so in-progress state survives.
	return (
		<div className="flex min-h-0 flex-1 flex-col sm:flex-row">
			<Rail
				section={section}
				sections={["timeline", "execute", "clients"]}
				onSelect={setSection}
			/>
			<div
				className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "timeline" ? "" : "hidden"}`}
			>
				<Timeline
					events={connection.events}
					clients={connection.clients}
					emptyStateHint={
						<>
							Add the inspector script to your mini app — the snippet lives behind the{" "}
							<strong>Connect</strong> button in the top bar. Phones on another
							network than this panel need a direct WebRTC path (STUN-only, no
							relays): if nothing arrives, put both on the same Wi-Fi.
						</>
					}
				/>
			</div>
			<div
				className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "execute" ? "" : "hidden"}`}
			>
				<Execute
					clients={connection.clients}
					events={connection.events}
					execute={connection.execute}
					emptyState={
						<p className="rounded-lg border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
							No mini app pages connected yet — allow one in, then execute bridge
							events here.
						</p>
					}
				/>
			</div>
			<div
				className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "clients" ? "" : "hidden"}`}
			>
				<Clients
					clients={connection.clients}
					emptyState={
						<p className="rounded-lg border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
							No mini app pages yet — they appear here as soon as one loads the
							inspector script and you approve it.
						</p>
					}
					bridgeWarning="No vkma bridge on this page — traffic is captured from the native bridge / page listeners. On desktop iframes outgoing calls are invisible without the devtools extension."
					onDeleteClient={clientId => {
						void connection.deleteClients([clientId]).catch(() => {});
					}}
				/>
			</div>
		</div>
	);
}
