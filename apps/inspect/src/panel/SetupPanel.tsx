import {
	Button,
	CopyInput,
	CrossIcon,
	IconButton,
	RefreshIcon,
	StatusLine,
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
	onClose,
}: {
	connection: InspectConnection;
	onClose: () => void;
}) {
	const scriptUrl = connection.scriptUrl;
	const snippet = `<script src="${scriptUrl}"></script>`;
	const importLine = `import("${scriptUrl}")`;

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/40 p-4">
			<div className="flex max-h-dvh w-full max-w-lg flex-col overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
				<header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-3.5 dark:border-neutral-800">
					<h2 className="text-sm font-semibold">Connect a mini app</h2>
					<IconButton label="Close" onClick={onClose}>
						<CrossIcon />
					</IconButton>
				</header>

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
							references at import, and the inspector wraps the native bridge first.
							Works on the phone (VK webview), in iframes and in production builds.
						</p>
						<CopyInput value={snippet} ariaLabel="Script tag snippet" />
					</section>

					<section className="flex flex-col gap-2">
						<h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
							Or from the console
						</h3>
						<p className="text-xs leading-relaxed text-neutral-500">
							For a quick look on a page you already have open (your own page —
							vk.com's CSP may block console imports). Loaded late, it sees less: only
							bridge methods that already exist.
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
							<button
								type="button"
								onClick={() => connection.setGateEnabled(!connection.gateEnabled)}
								role="switch"
								aria-checked={connection.gateEnabled}
								className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
									connection.gateEnabled
										? "bg-emerald-500"
										: "bg-neutral-300 dark:bg-neutral-700"
								}`}
								title="Toggle the approval gate"
							>
								<span
									className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
										connection.gateEnabled ? "left-[22px]" : "left-0.5"
									}`}
								/>
							</button>
						</div>
						<p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
							<WarningIcon />
							<span>
								The id in the snippet is the access key. The signaling broker hands
								a stopped id to whoever registers it first, so a page that learned
								the id can keep answering its connections while this panel is
								closed. Paste the snippet only on pages you trust — and rotate the
								id below after one you didn't.
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
							<Button
								variant="outline"
								size="md"
								onClick={connection.rotate}
								title="Mint a fresh peer id — pages holding the old one stop connecting until their snippet is updated"
							>
								<RefreshIcon />
								Rotate
							</Button>
						</div>
						<p className="text-[11px] leading-relaxed text-neutral-500">
							Rotating also frees an id the signaling server refuses to hand back (a
							hijack or a stale registration). Pages already holding the old snippet
							keep retrying a dead id until you update it.
						</p>
						<div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
							<div>
								<h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
									Keep this id across tabs
								</h3>
								<p className="text-xs text-neutral-500">
									Pinned: new tabs of this panel answer the same id — earlier
									snippets keep working. Unpinned: the id lives in this tab only,
									a fresh tab mints a fresh one.
								</p>
							</div>
							<button
								type="button"
								onClick={() => connection.setPinned(!connection.pinned)}
								role="switch"
								aria-checked={connection.pinned}
								className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
									connection.pinned
										? "bg-emerald-500"
										: "bg-neutral-300 dark:bg-neutral-700"
								}`}
								title="Pin the id to this origin — snippets survive tab restarts; a leaked id lives longer too"
							>
								<span
									className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
										connection.pinned ? "left-[22px]" : "left-0.5"
									}`}
								/>
							</button>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
