import { useState } from "react";
import type { VkmaConnection } from "../lib/rpc.ts";
import { CheckIcon } from "./icons.tsx";

/**
 * Full-panel gate for the states where the panel cannot work yet:
 * the trust handshake (unauthorized) and dead transports.
 */
export function StatusGate({ connection }: { connection: VkmaConnection }) {
	const [code, setCode] = useState("");
	const [requesting, setRequesting] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [wrong, setWrong] = useState(false);

	if (connection.status === "connecting") {
		return (
			<Center>
				<p className="text-sm text-neutral-500">Connecting to the dev server…</p>
			</Center>
		);
	}

	if (connection.status === "unauthorized") {
		return (
			<Center>
				<h1 className="text-sm font-semibold">Authorization required</h1>
				<p className="mt-2 max-w-72 text-center text-xs leading-relaxed text-neutral-500">
					This dev server only accepts trusted connections. Request a code — it prints in
					the dev server terminal — and enter it here once per browser.
				</p>
				<div className="mt-5 flex flex-col items-center gap-2.5">
					<div className="flex gap-2">
						<input
							type="text"
							inputMode="numeric"
							pattern="[0-9]*"
							maxLength={6}
							value={code}
							onChange={event => {
								setCode(event.target.value);
								setWrong(false);
							}}
							placeholder="123456"
							className="h-9 w-36 rounded-md border border-neutral-300 bg-white text-center font-mono text-lg tracking-[0.3em] dark:border-neutral-700 dark:bg-neutral-900"
						/>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={requesting}
							onClick={() => {
								setRequesting(true);
								void connection
									.requestAuthCode()
									.finally(() => setRequesting(false));
							}}
							className="h-8 rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
						>
							{requesting ? "Requested…" : "Request a code"}
						</button>
						<button
							type="button"
							disabled={code.length < 4 || submitting}
							onClick={() => {
								setSubmitting(true);
								void connection
									.submitAuthCode(code)
									.then(ok => {
										if (!ok) {
											setWrong(true);
										}
									})
									.finally(() => setSubmitting(false));
							}}
							className="h-8 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
						>
							{submitting ? "Checking…" : "Trust this browser"}
						</button>
					</div>
					{wrong && (
						<p className="text-xs text-red-500">
							That code did not work — it may have expired. Request a new one.
						</p>
					)}
					{code.length >= 4 && !wrong && (
						<p className="flex items-center gap-1.5 text-xs text-neutral-400">
							<CheckIcon width={12} height={12} /> Tip: the terminal also prints a
							one-click link.
						</p>
					)}
				</div>
			</Center>
		);
	}

	if (connection.status === "disconnected" || connection.status === "error") {
		return (
			<Center>
				<h1 className="text-sm font-semibold">
					{connection.status === "error" ? "Connection error" : "Disconnected"}
				</h1>
				<p className="mt-2 max-w-72 text-center text-xs leading-relaxed text-neutral-500">
					The dev server link dropped — it may be restarting. Reconnect when it is back.
				</p>
				{connection.lastError && (
					<p className="mt-3 max-w-80 break-words rounded-md bg-neutral-100 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-500 dark:bg-neutral-800/60">
						{connection.lastError}
					</p>
				)}
				<button
					type="button"
					onClick={connection.reconnect}
					className="mt-5 h-8 rounded-md bg-neutral-900 px-4 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
				>
					Reconnect
				</button>
			</Center>
		);
	}

	return null;
}

function Center({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
			<div className="flex max-w-sm flex-col items-center">{children}</div>
		</div>
	);
}
