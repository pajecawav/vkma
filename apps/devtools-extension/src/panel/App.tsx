import type { CaptureMode, ClientStatus } from "@vkma.dev/protocol";
import { Clients, Execute, Rail, Timeline, TopBar, type Section } from "@vkma.dev/ui";
import { useEffect, useState } from "react";
import { useVkmaExtension } from "./connection.ts";

const SECTION_KEY = "vkma:section";

/** One panel page, three surfaces: the FAB iframe and the tab panel pass
 * ?tab=; the side panel resolves its own tab (the panel is tab-specific
 * and opens on its tab, like the spy's). */
function resolveTabId(): number | undefined {
	const fromUrl = new URLSearchParams(window.location.search).get("tab");
	if (fromUrl !== null && /^\d+$/.test(fromUrl)) {
		return Number(fromUrl);
	}
	return undefined;
}

async function resolveSidePanelTabId(): Promise<number | undefined> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	return typeof tab?.id === "number" ? tab.id : undefined;
}

export function App() {
	const [urlTabId] = useState(resolveTabId);
	const [sidePanelTabId, setSidePanelTabId] = useState<number | undefined>(undefined);
	const isSidePanel = urlTabId === undefined;

	useEffect(() => {
		if (!isSidePanel) {
			return;
		}
		void resolveSidePanelTabId().then(setSidePanelTabId);
	}, [isSidePanel]);

	const tabId = urlTabId ?? sidePanelTabId;

	if (tabId === undefined) {
		return (
			<PanelFrame status="error" onReconnect={() => setSidePanelTabId(undefined)}>
				<p className="text-sm text-neutral-500">This panel has no tab to watch.</p>
			</PanelFrame>
		);
	}

	return <TabPanel tabId={tabId} />;
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

function TabPanel({ tabId }: { tabId: number }) {
	const connection = useVkmaExtension(tabId);
	const [section, setSection] = useState<Section>(() => {
		const stored = localStorage.getItem(SECTION_KEY);
		return stored === "execute" || stored === "clients" ? stored : "timeline";
	});

	useEffect(() => {
		localStorage.setItem(SECTION_KEY, section);
	}, [section]);

	if (connection.status !== "connected") {
		return (
			<PanelFrame
				status={connection.status}
				onReconnect={connection.reconnect}
				lastError={connection.lastError}
			/>
		);
	}

	return (
		<div className="flex h-dvh flex-col">
			<TopBar
				status={connection.status}
				onReconnect={connection.reconnect}
				capture={captureOf(connection.clients)}
			/>
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
								Open a mini app on this page — every request and event lands here,
								through the app&rsquo;s own @vkma.dev/bridge when it has one, or
								through the traffic sniffer when it doesn&rsquo;t.
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
								No mini app clients on this page yet. Open one — then execute bridge
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
								No mini app frames on this page yet — clients appear here as soon as
								one loads.
							</p>
						}
						bridgeWarning="No vkma bridge on this page — traffic is captured via the sniffer (spy mode). Events and execute still work."
					/>
				</div>
			</div>
		</div>
	);
}

/** The extension's gate: no OTP dance (messaging is extension-internal),
 * just the probe states of the tab's host script. */
function PanelFrame({
	status,
	onReconnect,
	lastError,
	children,
}: {
	status: "connecting" | "error" | "disconnected";
	onReconnect: () => void;
	lastError?: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex h-dvh flex-col">
			<TopBar status={status} onReconnect={onReconnect} />
			<div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
				<div className="flex max-w-sm flex-col items-center text-center">
					{status === "connecting" ? (
						<p className="text-sm text-neutral-500">Connecting to this tab…</p>
					) : (
						<>
							<h1 className="text-sm font-semibold">No devtools host on this tab</h1>
							<p className="mt-2 max-w-72 text-xs leading-relaxed text-neutral-500">
								The panel watches one tab. Open a VK page with a mini app (vk.com,
								vk.ru and friends), then reopen this panel.
							</p>
							{lastError && (
								<p className="mt-3 max-w-80 break-words rounded-md bg-neutral-100 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-500 dark:bg-neutral-800/60">
									{lastError}
								</p>
							)}
							<button
								type="button"
								onClick={onReconnect}
								className="mt-5 h-8 rounded-md bg-neutral-900 px-4 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
							>
								Retry
							</button>
						</>
					)}
					{children}
				</div>
			</div>
		</div>
	);
}
