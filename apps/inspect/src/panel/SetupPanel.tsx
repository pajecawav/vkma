import {
	Button,
	CopyInput,
	Modal,
	RefreshIcon,
	StatusLine,
	Switch,
	WarningIcon,
} from "@vkma.dev/ui";
import type { InspectConnection } from "./connection.ts";

/**
 * The setup sheet: everything a developer needs to point a mini app at
 * this panel — the script snippet (the ONLY reliable injection on a
 * phone's VK webview), the console variant for quick desktop checks,
 * the gate toggle and the id lifecycle (Rotate).
 */
export function SetupPanel({
	connection,
	open,
	onOpenChange,
}: {
	connection: InspectConnection;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const scriptUrl = connection.scriptUrl;
	const snippet = `<script src="${scriptUrl}"></script>`;
	const importLine = `import("${scriptUrl}")`;

	return (
		<Modal open={open} onOpenChange={onOpenChange} title="Connect a mini app">
			<div className="flex flex-col gap-5 px-5 py-4">
				<StatusLine
					status={connection.status}
					label={
						connection.status === "connected"
							? "Signaling online"
							: connection.status === "connecting"
								? "Connecting to signaling…"
								: "Signaling error"
					}
					extra="· WebRTC direct, no relays"
					title="Peer-to-peer: STUN only, no TURN relay exists in the config"
				/>

				<section className="flex flex-col gap-2">
					<h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
						In the mini app page — first in{" "}
						<code className="font-mono">&lt;head&gt;</code>
					</h3>
					<p className="text-xs leading-relaxed text-neutral-500">
						The tag must load BEFORE the app bundle: vk-bridge freezes its transport
						references at import, and the inspector wraps the native bridge first. Works
						on the phone (VK webview), in iframes and in production builds.
					</p>
					<CopyInput value={snippet} ariaLabel="Script tag snippet" />
				</section>

				<section className="flex flex-col gap-2">
					<h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
						Or from the console
					</h3>
					<p className="text-xs leading-relaxed text-neutral-500">
						For a quick look on a page you already have open (your own page — vk.com's
						CSP may block console imports). Loaded late, it sees less: only bridge
						methods that already exist.
					</p>
					<CopyInput value={importLine} ariaLabel="Console import snippet" />
				</section>

				<section className="flex flex-col gap-2">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
								Require approval
							</h3>
							<p className="text-xs text-neutral-500">
								New pages park until you allow them.
							</p>
						</div>
						<Switch
							checked={connection.gateEnabled}
							onCheckedChange={connection.setGateEnabled}
							ariaLabel="Toggle the approval gate"
						/>
					</div>
					<p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
						<WarningIcon />
						<span>
							The id in the snippet is the access key. The signaling broker hands a
							stopped id to whoever registers it first, so a page that learned the id
							can keep answering its connections while this panel is closed. Paste the
							snippet only on pages you trust — and rotate the id below after one you
							didn't.
						</span>
					</p>
				</section>

				<section className="flex flex-col gap-2">
					<h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
						Id
					</h3>
					<div className="flex items-center gap-2">
						<code className="min-w-0 flex-1 truncate rounded-md bg-neutral-100 px-2.5 py-1.5 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
							{connection.peerId ?? "settling…"}
						</code>
						{/* No tooltip: the paragraph below already explains what
						    rotating does — it would only repeat it. */}
						<Button variant="outline" size="md" onClick={connection.rotate}>
							<RefreshIcon />
							Rotate
						</Button>
					</div>
					<p className="text-[11px] leading-relaxed text-neutral-500">
						Rotating also frees an id the signaling server refuses to hand back (a
						hijack or a stale registration). Pages already holding the old snippet keep
						retrying a dead id until you update it.
					</p>
					<div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
						<div>
							<h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
								Keep this id across tabs
							</h3>
							<p className="text-xs text-neutral-500">
								Pinned: new tabs of this panel answer the same id — earlier snippets
								keep working. Unpinned: the id lives in this tab only, a fresh tab
								mints a fresh one.
							</p>
						</div>
						<Switch
							checked={connection.pinned}
							onCheckedChange={connection.setPinned}
							ariaLabel="Keep this id across tabs"
							tooltip="Pin the id to this origin — snippets survive tab restarts; a leaked id lives longer too"
						/>
					</div>
				</section>
			</div>
		</Modal>
	);
}
