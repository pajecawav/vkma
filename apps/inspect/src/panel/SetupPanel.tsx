import { CheckIcon, CrossIcon, RefreshIcon, WarningIcon } from "@vkma.dev/ui";
import { useState } from "react";
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
					<button
						type="button"
						onClick={onClose}
						className="grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
						title="Close"
					>
						<CrossIcon />
					</button>
				</header>

				<div className="flex flex-col gap-5 px-5 py-4">
					<PeerRow connection={connection} />

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
						<CopyRow label={snippet} copy={snippet} />
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
						<CopyRow label={importLine} copy={importLine} />
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
								The id in the snippet is the access key: anyone holding it can read
								this panel's traffic and launch params. Never commit the snippet to
								a public repo — or rotate the id below.
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
							<button
								type="button"
								onClick={connection.rotate}
								className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800"
								title="Mint a fresh peer id — pages holding the old one stop connecting until their snippet is updated"
							>
								<RefreshIcon />
								Rotate
							</button>
						</div>
						<p className="text-[11px] leading-relaxed text-neutral-500">
							Rotating also frees an id the signaling server refuses to hand back (a
							hijack or a stale registration). Pages already holding the old snippet
							keep retrying a dead id until you update it.
						</p>
					</section>
				</div>
			</div>
		</div>
	);
}

function PeerRow({ connection }: { connection: InspectConnection }) {
	const meta =
		connection.status === "connected"
			? { dot: "bg-emerald-500", label: "Signaling online", tone: "text-neutral-500" }
			: connection.status === "connecting"
				? {
						dot: "bg-neutral-400",
						label: "Connecting to signaling…",
						tone: "text-neutral-500",
					}
				: {
						dot: "bg-red-500",
						label: "Signaling error",
						tone: "text-red-600 dark:text-red-400",
					};
	return (
		<p
			className="flex items-center gap-2 text-xs"
			title="Peer-to-peer: STUN only, no TURN relay exists in the config"
		>
			<span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
			<span className={meta.tone}>{meta.label}</span>
			<span className="text-neutral-400">· WebRTC direct, no relays</span>
		</p>
	);
}

function CopyRow({ label, copy }: { label: string; copy: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex items-center gap-2">
			<code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-neutral-100 px-2.5 py-1.5 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
				{label}
			</code>
			<button
				type="button"
				onClick={() => {
					void navigator.clipboard
						.writeText(copy)
						.then(() => {
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						})
						.catch(() => {});
				}}
				className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-neutral-200 px-2.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800"
				title="Copy"
			>
				{copied ? <CheckIcon /> : null}
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}
