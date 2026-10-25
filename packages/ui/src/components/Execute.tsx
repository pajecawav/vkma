import type { ClientInfo, ExecResult, WireEvent } from "@vkma.dev/protocol";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { platformLabel, shortId } from "../lib/format.ts";
import { CheckIcon, ChevronIcon, CrossIcon } from "./icons.tsx";
import { JsonTree } from "./JsonTree.tsx";

type Pending = { state: "pending" } | { state: "done"; result: ExecResult };

function resultPanel(result: ExecResult) {
	switch (result.status) {
		case "ok":
			return { tone: "ok" as const, title: "Response", payload: result.payload };
		case "error":
			return { tone: "error" as const, title: "Error response", payload: result.payload };
		case "timeout":
			return {
				tone: "warn" as const,
				title: "Timeout",
				payload: "No client answered within 20s — is the target app still open?",
			};
		case "no-client":
			return {
				tone: "warn" as const,
				title: "No such client",
				payload: `${shortId(result.clientId)} is not connected anymore.`,
			};
		case "forbidden":
			return {
				tone: "warn" as const,
				title: "Outside this panel's scope",
				payload: `${shortId(result.clientId)} is not this embedded panel's client.`,
			};
	}
}

export function Execute({
	clients,
	events,
	execute,
	fixedClientId,
	emptyState,
}: {
	clients: ClientInfo[];
	events: WireEvent[];
	execute: (
		clientId: string,
		name: string,
		params: Record<string, unknown> | undefined,
	) => Promise<ExecResult>;
	/** Embedded mode: the panel is bound to this client only. */
	fixedClientId?: string;
	/** Overrides the "no clients" card (surfaces with other capture modes). */
	emptyState?: ReactNode;
}) {
	const knownNames = useMemo(() => {
		const names = new Set<string>();
		for (const event of events) {
			names.add(event.name);
		}
		return [...names].toSorted();
	}, [events]);

	const latest = clients.length > 0 ? clients.at(-1) : undefined;
	const latestClientId = latest?.clientId ?? "";
	const [target, setTarget] = useState("");
	// Derived, not stored: clients land after this component mounts (the
	// state snapshot follows the connect), so a stored id would stay `""`
	// forever — and every Send would silently no-op. Falls back to the
	// latest client while nothing is picked and when a picked client has
	// disconnected.
	const activeTarget =
		fixedClientId ??
		(clients.some(client => client.clientId === target) ? target : latestClientId);
	const [name, setName] = useState("");
	const [paramsText, setParamsText] = useState("{\n  \n}");
	const [pending, setPending] = useState<Pending>();

	const paramsError = useMemo(() => {
		try {
			JSON.parse(paramsText);
			return undefined;
		} catch (error) {
			return error instanceof Error ? error.message : "Invalid JSON";
		}
	}, [paramsText]);

	const send = async () => {
		if (!activeTarget || name.trim() === "" || paramsError) {
			return;
		}
		setPending({ state: "pending" });
		try {
			const result = await execute(
				activeTarget,
				name.trim(),
				paramsText.trim() === "" ? undefined : JSON.parse(paramsText),
			);
			setPending({ state: "done", result });
		} catch (error) {
			setPending({
				state: "done",
				result: {
					status: "error",
					payload: error instanceof Error ? error.message : String(error),
				},
			});
		}
	};

	return (
		<section
			className="scroll-area min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"
			aria-label="Execute"
		>
			<div className="mx-auto flex max-w-xl flex-col gap-4">
				{clients.length === 0 ? (
					(emptyState ?? (
						<p className="rounded-lg border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
							No connected clients. Open the mini app with the devtools plugin — then
							execute bridge events here.
						</p>
					))
				) : (
					<>
						{!fixedClientId && (
							<label className="flex flex-col gap-1.5">
								<span className="text-xs font-medium text-neutral-500">Target</span>
								<div className="relative">
									<select
										value={activeTarget}
										onChange={event => setTarget(event.target.value)}
										className="h-8 w-full cursor-pointer appearance-none rounded-md border border-neutral-200 bg-white pl-2 pr-7 text-sm dark:border-neutral-800 dark:bg-neutral-900"
									>
										{clients.map(client => (
											<option key={client.clientId} value={client.clientId}>
												{platformLabel(client.platform)} ·{" "}
												{shortId(client.clientId)}
											</option>
										))}
									</select>
									<span
										className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400"
										aria-hidden="true"
									>
										<ChevronIcon width={12} height={12} className="rotate-90" />
									</span>
								</div>
							</label>
						)}

						<label className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-neutral-500">Event</span>
							<input
								type="text"
								value={name}
								onChange={event => setName(event.target.value)}
								list="vkma-known-events"
								placeholder="VKWebAppGetUserInfo"
								spellCheck={false}
								className="h-8 rounded-md border border-neutral-200 bg-white px-2.5 font-mono text-sm dark:border-neutral-800 dark:bg-neutral-900"
							/>
							<datalist id="vkma-known-events">
								{knownNames.map(known => (
									<option key={known} value={known} />
								))}
							</datalist>
						</label>

						<label className="flex flex-col gap-1.5">
							<span className="flex items-center gap-2 text-xs font-medium text-neutral-500">
								Params
								{paramsError && (
									<span className="font-normal text-red-500">{paramsError}</span>
								)}
							</span>
							<textarea
								value={paramsText}
								onChange={event => setParamsText(event.target.value)}
								rows={6}
								spellCheck={false}
								className="scroll-area rounded-md border border-neutral-200 bg-white p-2.5 font-mono text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-900"
							/>
						</label>

						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => void send()}
								disabled={
									activeTarget === "" ||
									name.trim() === "" ||
									paramsError !== undefined ||
									pending?.state === "pending"
								}
								className="h-8 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
							>
								{pending?.state === "pending" ? "Sending…" : "Send"}
							</button>
							<span className="text-[11px] text-neutral-400">
								The request also appears in the timeline.
							</span>
						</div>

						{pending?.state === "done" &&
							(() => {
								const panel = resultPanel(pending.result);
								return (
									<div
										className={`flex min-h-40 flex-col rounded-lg border p-3 ${
											panel.tone === "ok"
												? "border-emerald-600/30 bg-emerald-500/[0.06]"
												: panel.tone === "error"
													? "border-red-500/30 bg-red-500/[0.06]"
													: "border-amber-500/30 bg-amber-500/[0.06]"
										}`}
										role="status"
									>
										<p className="flex items-center gap-1.5 text-xs font-medium">
											{panel.tone === "ok" && (
												<CheckIcon
													width={13}
													height={13}
													className="text-emerald-600"
												/>
											)}
											{panel.tone === "error" && (
												<CrossIcon
													width={13}
													height={13}
													className="text-red-500"
												/>
											)}
											{panel.title}
										</p>
										<div className="scroll-area mt-2 max-h-[55vh] flex-1 overflow-auto font-mono text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300">
											<JsonTree value={panel.payload ?? null} />
										</div>
									</div>
								);
							})()}
					</>
				)}
			</div>
		</section>
	);
}
