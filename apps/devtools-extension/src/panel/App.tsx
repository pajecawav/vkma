import type { CaptureMode, ClientStatus, WireEvent } from "@vkma.dev/protocol";
import {
	Button,
	Clients,
	Execute,
	IconButton,
	PanelRightIcon,
	Rail,
	Timeline,
	TopBar,
	UiProvider,
	type Section,
} from "@vkma.dev/ui";
import { FabPositionControl } from "@vkma.dev/ui";
import { useEffect, useState } from "react";
import { OPEN_SIDE_PANEL_MESSAGE } from "../shared/hosts.ts";
import { useVkmaAllTabs, useVkmaExtension, type ExtensionConnection } from "./connection.ts";
import { useFabPosition } from "./fab-position.ts";
import { useExtensionTheme } from "./theme.ts";

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
	return (
		<UiProvider>
			<PanelRoot />
		</UiProvider>
	);
}

/**
 * One panel page, three surfaces: the tab panel (?view=all) watches EVERY
 * VK tab at once — the /__vkma/ standalone panel's counterpart — while
 * the FAB iframe (?tab=…) and the side panel (no query, resolves its own
 * tab) stay scoped to their tab.
 */
function PanelRoot() {
	const [viewAll] = useState(
		() => new URLSearchParams(window.location.search).get("view") === "all",
	);
	const [urlTabId] = useState(() => (viewAll ? undefined : resolveTabId()));
	const [sidePanelTabId, setSidePanelTabId] = useState<number | undefined>(undefined);
	const isSidePanel = !viewAll && urlTabId === undefined;
	// One theme subscription per surface, hoisted above every branch — a
	// hook behind a conditional return flips the hook count and dies with
	// React #310 (learned the hard way).
	const theme = useExtensionTheme();

	useEffect(() => {
		if (viewAll || !isSidePanel) {
			return;
		}
		void resolveSidePanelTabId().then(setSidePanelTabId);
	}, [viewAll, isSidePanel]);

	const tabId = urlTabId ?? sidePanelTabId;

	if (viewAll) {
		return <GlobalPanel theme={theme} />;
	}

	if (tabId === undefined) {
		return (
			<PanelFrame
				status="error"
				onReconnect={() => setSidePanelTabId(undefined)}
				theme={theme}
			>
				<p className="text-sm text-neutral-500">This panel has no tab to watch.</p>
			</PanelFrame>
		);
	}

	return <TabPanel tabId={tabId} embeddedInSidePanel={isSidePanel} theme={theme} />;
}

/** The panel body shared by both modes: sections render whatever
 * connection is handed in (tab-scoped or global). */
function Sections({
	events,
	clients,
	execute,
	deleteClients,
}: {
	events: WireEvent[];
	clients: ClientStatus[];
	execute: ExtensionConnection["execute"];
	deleteClients: ExtensionConnection["deleteClients"];
}) {
	const [section, setSection] = useState<Section>(() => {
		const stored = localStorage.getItem(SECTION_KEY);
		return stored === "execute" || stored === "clients" ? stored : "timeline";
	});

	useEffect(() => {
		localStorage.setItem(SECTION_KEY, section);
	}, [section]);

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
					events={events}
					clients={clients}
					emptyStateHint={
						<>
							Open a mini app — every request and event lands here, through the
							app&rsquo;s own @vkma.dev/bridge when it has one, or through the traffic
							sniffer when it doesn&rsquo;t.
						</>
					}
				/>
			</div>
			<div
				className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "execute" ? "" : "hidden"}`}
			>
				<Execute
					clients={clients}
					events={events}
					execute={execute}
					emptyState={
						<p className="rounded-lg border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
							No mini app clients yet. Open one — then execute bridge events here.
						</p>
					}
				/>
			</div>
			<div
				className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "clients" ? "" : "hidden"}`}
			>
				<Clients
					clients={clients}
					emptyState={
						<p className="rounded-lg border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
							No mini app frames yet — clients appear here as soon as one loads.
						</p>
					}
					bridgeWarning="No vkma bridge on this page — traffic is captured via the sniffer (spy mode). Events and execute still work."
					onDeleteClient={clientId => {
						void deleteClients([clientId]).catch(() => {});
					}}
				/>
			</div>
		</div>
	);
}

function GlobalPanel({ theme }: { theme: { dark: boolean; toggle: () => void } }) {
	const connection = useVkmaAllTabs();

	if (connection.status !== "connected") {
		const nothingYet = connection.tabCount === 0 && connection.status === "error";
		// Watched tabs exist but no host answered (e.g. the extension was
		// installed while they were already open — content scripts inject
		// on the next load). Distinct copy from the tab-scoped default.
		const hostsPending = connection.tabCount > 0 && connection.status === "error";
		return (
			<PanelFrame
				status={connection.status}
				onReconnect={connection.reconnect}
				theme={theme}
				heading={
					nothingYet
						? "Nothing is being watched yet"
						: hostsPending
							? "The watched tabs host no devtools panel yet"
							: undefined
				}
				hint={
					nothingYet
						? "Open a VK page with a mini app in any tab — it appears here automatically."
						: hostsPending
							? "The host script injects on page load — reload a watched VK tab and its traffic appears here."
							: undefined
				}
			/>
		);
	}

	// No capture chip and no FAB-placement control here: capture is a
	// per-tab fact (per-client on the Clients tab), and the placement
	// belongs to the surfaces that actually host the FAB (its own panel,
	// the side panel).
	return (
		<div className="flex h-dvh flex-col">
			<TopBar status={connection.status} onReconnect={connection.reconnect} theme={theme} />
			<Sections
				events={connection.events}
				clients={connection.clients}
				execute={connection.execute}
				deleteClients={connection.deleteClients}
			/>
		</div>
	);
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

/** Chrome 116+ exposes the sidePanel API surface in extension pages too;
 * Firefox never does — the button hides there. */
const sidePanelSupported = () => typeof chrome !== "undefined" && chrome.sidePanel !== undefined;

function TabPanel({
	tabId,
	embeddedInSidePanel,
	theme,
}: {
	tabId: number;
	embeddedInSidePanel: boolean;
	theme: { dark: boolean; toggle: () => void };
}) {
	const connection = useVkmaExtension(tabId);
	const fabPosition = useFabPosition();

	if (connection.status !== "connected") {
		return (
			<PanelFrame
				status={connection.status}
				onReconnect={connection.reconnect}
				lastError={connection.lastError}
				theme={theme}
			/>
		);
	}

	// Clicking in the panel page is a user gesture, and a one-shot
	// runtime message carries it into the service worker (werpc ports do
	// not) — that is what sidePanel.open() demands. The tabId rides the
	// payload because extension pages have no sender.tab.
	const openSidePanel =
		sidePanelSupported() && !embeddedInSidePanel
			? () => {
					// the listener never responds — swallow the closed-port
					// rejection instead of leaking it as a console error
					void chrome.runtime
						.sendMessage({ type: OPEN_SIDE_PANEL_MESSAGE, tabId })
						.catch(() => {});
				}
			: undefined;

	return (
		<div className="flex h-dvh flex-col">
			<TopBar
				status={connection.status}
				onReconnect={connection.reconnect}
				capture={captureOf(connection.clients)}
				theme={theme}
				actions={
					<>
						<FabPositionControl
							position={fabPosition.position}
							onPick={fabPosition.pick}
						/>
						{openSidePanel && (
							<IconButton
								label="Open the side panel for this tab"
								onClick={openSidePanel}
							>
								<PanelRightIcon />
							</IconButton>
						)}
					</>
				}
			/>
			<Sections
				events={connection.events}
				clients={connection.clients}
				execute={connection.execute}
				deleteClients={connection.deleteClients}
			/>
		</div>
	);
}

/** The extension's gate: no OTP dance (messaging is extension-internal),
 * just the probe states of the tab's host script. */
function PanelFrame({
	status,
	onReconnect,
	lastError,
	theme,
	heading,
	hint,
	children,
}: {
	status: "connecting" | "error" | "disconnected";
	onReconnect: () => void;
	lastError?: string;
	theme: { dark: boolean; toggle: () => void };
	heading?: string;
	hint?: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex h-dvh flex-col">
			<TopBar status={status} onReconnect={onReconnect} theme={theme} />
			<div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
				<div className="flex max-w-sm flex-col items-center text-center">
					{status === "connecting" ? (
						<p className="text-sm text-neutral-500">Connecting to this tab…</p>
					) : (
						<>
							<h1 className="text-sm font-semibold">
								{heading ?? "No devtools host on this tab"}
							</h1>
							<p className="mt-2 max-w-72 text-center text-xs leading-relaxed text-neutral-500">
								{hint ??
									"The panel watches one tab. Open a VK page with a mini app (vk.com, vk.ru and friends), then reopen this panel."}
							</p>
							{lastError && (
								<p className="mt-3 max-w-80 break-words rounded-md bg-neutral-100 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-500 dark:bg-neutral-800/60">
									{lastError}
								</p>
							)}
							<Button
								variant="solid"
								size="md"
								onClick={onReconnect}
								className="mt-5"
							>
								Retry
							</Button>
						</>
					)}
					{children}
				</div>
			</div>
		</div>
	);
}
