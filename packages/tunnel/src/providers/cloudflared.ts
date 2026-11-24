/**
 * The cloudflared provider: Cloudflare Tunnel through the `cloudflared`
 * binary. The design and the measurements behind every timing here are in
 * `DESIGN.md`; this file is their execution.
 *
 * What makes it different from the opentunnel provider:
 *
 * - It is a child process, not an in-process SDK. The binary comes from
 *   PATH and is never downloaded.
 * - TLS ends at Cloudflare's edge; the browser speaks HTTP/2 to it.
 * - A Quick Tunnel is announced only once the public URL answers: the DNS
 *   record appears seconds after cloudflared prints the URL, and edge
 *   frontends answer `530` until they know the route.
 * - A restarted Quick Tunnel has a NEW hostname: `url-changed`.
 * - Teardown is hard-capped. On a dead control stream cloudflared spends
 *   its whole 30 s grace period in a busy loop at 100 % of a core.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
	CLOUDFLARED_PROVIDER,
	DEFAULT_CLOUDFLARED_MODE,
	DEFAULT_CLOUDFLARED_PROTOCOL,
} from "../constants.ts";
import type {
	TunnelProvider,
	TunnelProviderConnectOptions,
	TunnelProviderConnection,
	TunnelStatus,
} from "../core/types.ts";
import { TunnelError } from "../errors.ts";
import {
	CLOUDFLARED_SUPPORT_DAYS,
	childEnv as toChildEnv,
	type ProviderEnv,
	readCloudflaredVersion,
	resolveCloudflaredBinary,
} from "./cloudflared-binary.ts";
import { createEventStream } from "./event-stream.ts";
import { httpStatus, probeHttp } from "./probe.ts";

/**
 * Every timing in one mutable object so tests can shrink them; production
 * code never writes to it.
 */
export const cloudflaredTimings = {
	/** No URL (quick) / no registration (token) within this after launch: the start failed. */
	urlTimeoutMs: 20_000,
	/**
	 * The DNS record shows up 1–13 s after the URL line, and a lookup that
	 * comes earlier is cached as NXDOMAIN for a minute. Nothing touches the
	 * name before this delay.
	 */
	warmupMinDelayMs: 2_000,
	/** How long the public URL may stay unanswered before it is announced anyway. */
	warmupCapMs: 60_000,
	warmupStepMs: 3_000,
	probeTimeoutMs: 10_000,
	/** Backoff before each respawn; past the last one the tunnel is given up. */
	respawnDelaysMs: [1_000, 2_000, 4_000, 8_000, 16_000],
	/** SIGTERM, then this, then SIGKILL (see the file comment). */
	termGraceMs: 3_000,
	killGraceMs: 2_000,
	/** Health watchdog: the opentunnel policy, same numbers. */
	watchdogIntervalMs: 20_000,
	watchdogFailureLimit: 2,
};

/**
 * Cloudflare's own error statuses and up: `530` is "the tunnel behind
 * this hostname is not being served". Anything below came from the local
 * target (its 404s and 500s included) and means the chain is up.
 */
const CLOUDFLARE_ERROR_STATUS = 520;

const QUICK_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

/** One line of cloudflared's logfmt output, reduced to what we act on. */
export interface ParsedCloudflaredLine {
	readonly kind:
		| "url"
		| "registered"
		| "unregistered"
		| "terminated"
		| "error"
		| "retrying"
		| "shutdown"
		| "stopped"
		| "other";
	readonly url?: string;
	readonly error?: string;
	readonly retryInMs?: number;
	readonly location?: string;
	readonly protocol?: string;
}

/** Parses one log line (pure; the tests pin it to real cloudflared output). */
export function parseCloudflaredLine(line: string): ParsedCloudflaredLine {
	const url = QUICK_URL_PATTERN.exec(line)?.[0];
	if (url !== undefined) {
		return { kind: "url", url };
	}
	if (line.includes("Registered tunnel connection")) {
		return {
			kind: "registered",
			location: /\blocation=(\w+)/.exec(line)?.[1],
			protocol: /\bprotocol=(\w+)/.exec(line)?.[1],
		};
	}
	if (line.includes("Unregistered tunnel connection")) {
		return { kind: "unregistered" };
	}
	if (line.includes("Connection terminated")) {
		return { kind: "terminated" };
	}
	if (line.includes("Serve tunnel error")) {
		return { kind: "error", error: logValue(line, "error") ?? "serve tunnel error" };
	}
	const retry = /Retrying connection in up to (\d+(?:\.\d+)?)(ms|s)/.exec(line);
	if (retry !== null) {
		const amount = Number(retry[1]);
		return {
			kind: "retrying",
			retryInMs: Math.round(retry[2] === "s" ? amount * 1000 : amount),
		};
	}
	if (line.includes("Initiating graceful shutdown")) {
		return { kind: "shutdown" };
	}
	if (line.includes("Tunnel server stopped")) {
		return { kind: "stopped" };
	}
	return { kind: "other" };
}

/** `key="a value"` or `key=value` out of a logfmt line. */
function logValue(line: string, key: string): string | undefined {
	return (
		new RegExp(`\\b${key}="([^"]*)"`).exec(line)?.[1] ??
		new RegExp(`\\b${key}=(\\S+)`).exec(line)?.[1]
	);
}

interface ExitInfo {
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
	readonly error?: Error;
}

/** One cloudflared process. `registeredAt`/`url` settle from its own output. */
interface Run {
	readonly id: number;
	readonly child: ChildProcess;
	readonly exit: Promise<ExitInfo>;
	/** Resolves when this process reported `Registered tunnel connection`. */
	readonly registeredAt: Promise<number>;
	/** Resolves with the URL this process printed (quick mode). */
	readonly url: Promise<string>;
}

export const cloudflaredProvider: TunnelProvider<"cloudflared"> = {
	id: CLOUDFLARED_PROVIDER,
	// Quick mode passes `--http-host-header`: cloudflared rewrites the Host
	// the target sees. Token mode cannot be helped from here: the
	// dashboard's origin settings decide where the traffic goes, and it
	// never passes a proxy the core could start.
	hostHeaderPolicy: options => (cloudflaredMode(options) === "quick" ? "provider" : "unhandled"),
	// A Quick Tunnel mints a one-time URL: nothing stable to store.
	persistentIdentity: options => cloudflaredMode(options) !== "quick",
	// Token mode's hostname is configured, not minted: known up front.
	knownHostname: options =>
		cloudflaredMode(options) === "token" ? options.cloudflared?.hostname : undefined,
	connect(options) {
		return connectCloudflared(options);
	},
};

function cloudflaredMode(options: TunnelProviderConnectOptions): "quick" | "token" {
	return options.cloudflared?.mode ?? DEFAULT_CLOUDFLARED_MODE;
}

function hostnameOf(url: string): string {
	if (url === "") {
		return "";
	}
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

/** Splits a byte stream into lines; a trailing unterminated line is dropped. */
function lineFeeder(onLine: (line: string) => void): (chunk: Buffer) => void {
	let buffer = "";
	return chunk => {
		buffer += chunk.toString();
		let index = buffer.indexOf("\n");
		while (index !== -1) {
			onLine(buffer.slice(0, index).replace(/\r$/, ""));
			buffer = buffer.slice(index + 1);
			index = buffer.indexOf("\n");
		}
	};
}

/** Rejects with the abort as soon as `signal` fires; otherwise follows `promise`. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
	if (signal === undefined) {
		return promise;
	}
	return new Promise<T>((resolve, reject) => {
		const onAbort = (): void => {
			reject(new TunnelError("aborted", "Tunnel connect aborted", { code: "E_ABORTED" }));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			value => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			error => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}

/** A timer that never outlives its race: true when `promise` settled before `ms` passed. */
async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
	const controller = new AbortController();
	try {
		return await Promise.race([
			promise.then(() => true),
			sleep(ms, undefined, { signal: controller.signal }).then(
				() => false,
				() => false,
			),
		]);
	} finally {
		controller.abort();
	}
}

async function connectCloudflared(
	options: TunnelProviderConnectOptions,
): Promise<TunnelProviderConnection> {
	// An already-aborted signal fires no `abort` event, so nothing below
	// would ever stop the tunnel. The Node API can be handed one.
	if (options.signal?.aborted === true) {
		throw new TunnelError("aborted", "Tunnel connect aborted", { code: "E_ABORTED" });
	}
	const settings = options.cloudflared;
	const mode = cloudflaredMode(options);
	const protocol = settings?.protocol ?? DEFAULT_CLOUDFLARED_PROTOCOL;
	const env: ProviderEnv = options.env ?? {};
	const timings = cloudflaredTimings;
	const warn = (message: string): void => options.onWarning?.(message);

	// -- the binary ----------------------------------------------------------
	const binary = resolveCloudflaredBinary(settings?.binary, env);
	const version = readCloudflaredVersion(binary, env);
	if (version.ageDays > CLOUDFLARED_SUPPORT_DAYS) {
		warn(
			`cloudflared ${version.version} is about ${String(Math.round(version.ageDays / 30))} months old — Cloudflare supports releases for one year, update it`,
		);
	}

	// -- what to run ---------------------------------------------------------
	const baseArgs = ["tunnel", "--no-autoupdate", "--loglevel", "info", "--protocol", protocol];
	let args: string[];
	let childEnv: Record<string, string>;
	/** The public URL as far as we know it; quick mode learns it from the child. */
	let url: string | undefined;
	if (mode === "token") {
		// The token is the user's dashboard token: it reaches the child through
		// its environment only — `argv` is visible to every process.
		const token = settings?.token ?? env["TUNNEL_TOKEN"];
		if (token === undefined || token === "") {
			throw new TunnelError(
				"config",
				"cloudflared token mode needs a tunnel token: set TUNNEL_TOKEN (or cloudflared.token)",
				{ code: "E_CLOUDFLARED_TOKEN" },
			);
		}
		if (settings?.hostname === undefined) {
			throw new TunnelError(
				"config",
				"cloudflared token mode needs cloudflared.hostname: the public hostname configured in the dashboard",
				{ code: "E_CLOUDFLARED_HOSTNAME" },
			);
		}
		url = `https://${settings.hostname}`;
		args = [...baseArgs, "run"];
		childEnv = { ...toChildEnv(env), TUNNEL_TOKEN: token };
	} else {
		args = [...baseArgs, "--url", `http://${options.host}:${String(options.port)}`];
		// `--http-host-header` is honoured with `--url` only, i.e. exactly in
		// quick mode: Vite's allowedHosts check wants `localhost`. This is
		// the provider's own rewrite, so it obeys the caller's switch like
		// the core's proxy does: with `hostRewrite: false` the public
		// `*.trycloudflare.com` Host reaches the target as is.
		if (options.hostRewrite !== false) {
			args.push("--http-host-header", `localhost:${String(options.port)}`);
		}
		childEnv = toChildEnv(env);
	}

	// -- supervisor state ----------------------------------------------------
	const events = createEventStream(options.onEvent);
	let state: TunnelStatus["state"] = "connecting";
	let lastError: string | undefined;
	/** The current run reported `Registered tunnel connection`. */
	let registered = false;
	/** The first `connected` event went out; later ones follow the gate. */
	let announced = false;
	let tornDown = false;
	let respawning = false;
	/**
	 * The first settle succeeded. From there a death is the supervisor's to
	 * answer; before it, the start owns the failure.
	 */
	let started = false;
	let runCounter = 0;
	let respawns = 0;
	let failures = 0;
	let watchdog: NodeJS.Timeout | undefined;
	let current: Run | undefined;
	/** The last lines of child output: what an unexpected exit shows. */
	const recent: string[] = [];

	let settleResolve: () => void = () => undefined;
	let settleReject: (error: unknown) => void = () => undefined;
	const settleClosed = new Promise<void>((resolve, reject) => {
		settleResolve = resolve;
		settleReject = reject;
	});

	const stopWatchdog = (): void => {
		if (watchdog !== undefined) {
			clearInterval(watchdog);
			watchdog = undefined;
		}
	};

	// -- child processes -----------------------------------------------------
	const launch = (): Run => {
		runCounter += 1;
		const child = spawn(binary, args, { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
		const exit = new Promise<ExitInfo>(resolve => {
			child.once("error", error => resolve({ code: null, signal: null, error }));
			child.once("close", (code, signal) => resolve({ code, signal }));
		});
		let markRegistered: () => void = () => undefined;
		let giveUrl: (value: string) => void = () => undefined;
		const run: Run = {
			id: runCounter,
			child,
			exit,
			registeredAt: new Promise<number>(resolve => {
				markRegistered = () => resolve(Date.now());
			}),
			url: new Promise<string>(resolve => {
				giveUrl = resolve;
			}),
		};
		const feed = lineFeeder(line => onLine(line, run, markRegistered, giveUrl));
		child.stdout?.on("data", feed);
		child.stderr?.on("data", feed);
		void exit.then(info => onExit(run, info));
		return run;
	};

	function onLine(
		line: string,
		run: Run,
		markRegistered: () => void,
		giveUrl: (value: string) => void,
	): void {
		recent.push(line);
		if (recent.length > 20) {
			recent.shift();
		}
		const parsed = parseCloudflaredLine(line);
		// After a failure was reported the lines of the dying process are noise.
		if (parsed.kind === "url") {
			giveUrl(parsed.url ?? "");
		}
		if (tornDown) {
			return;
		}
		switch (parsed.kind) {
			case "registered":
				if (run !== current || registered) {
					return;
				}
				registered = true;
				state = "connected";
				lastError = undefined;
				markRegistered();
				// The first attach is announced by the caller's banner; a later
				// one only once the warm-up gate has passed.
				if (!announced) {
					events.push({
						type: "connected",
						session: `${String(run.id)}@${parsed.location ?? "edge"}`,
						routes: ["@"],
					});
				}
				break;
			case "error":
				lastError = parsed.error;
				break;
			case "retrying":
				if (run !== current) {
					return;
				}
				registered = false;
				state = "reconnecting";
				events.push({ type: "disconnected", reason: lastError ?? "connection lost" });
				events.push({ type: "reconnecting", attempt: 1, delayMs: parsed.retryInMs ?? 0 });
				break;
			case "unregistered":
			case "terminated":
				if (run !== current || !registered) {
					return;
				}
				registered = false;
				state = "reconnecting";
				events.push({ type: "disconnected", reason: lastError ?? "connection terminated" });
				break;
			case "shutdown":
			case "stopped":
				state = "stopped";
				break;
			default:
				break;
		}
	}

	function onExit(run: Run, info: ExitInfo): void {
		// Before the first settle the start owns the failure: `settle` races
		// the exit, in front of the warm-up gate and behind it. A respawn from
		// here launched a replacement for a tunnel that was about to be
		// reported as failed, and printed `reconnecting` above that error.
		if (tornDown || respawning || run !== current || !started) {
			return;
		}
		registered = false;
		state = "reconnecting";
		void supervise(info);
	}

	const exitedError = (info: ExitInfo, duringStart: boolean): TunnelError => {
		const how =
			info.error !== undefined
				? info.error.message
				: info.signal !== null
					? `killed by ${info.signal}`
					: `exit code ${String(info.code)}`;
		const tail = recent.slice(-6).join("\n    ");
		return new TunnelError(
			"network",
			[
				`cloudflared ${duringStart ? "failed to start" : "exited"} (${how})`,
				...(tail === "" ? [] : [`    ${tail}`]),
			].join("\n"),
			{ code: "E_CLOUDFLARED_EXITED", cause: info.error },
		);
	};

	/**
	 * Waits for the public URL to answer, or for the warm-up cap. Nothing
	 * looks the name up before `warmupMinDelayMs` has passed since the URL
	 * line. `signal` ends the wait early: the gate was abandoned (an abort,
	 * a teardown, or the process died behind it).
	 *
	 * Returns without an answer in two cases the caller tells apart: the
	 * cap ran out — the URL is then announced unverified, and silently on
	 * purpose, because the line that used to go here ("does not answer
	 * yet") printed on EVERY start wherever this machine cannot reach the
	 * edge — or the tunnel is being torn down, which `settle` reports.
	 */
	async function warmUp(target: string, signal: AbortSignal): Promise<void> {
		const startedAt = Date.now();
		await sleep(timings.warmupMinDelayMs, undefined, { signal });
		for (;;) {
			if (tornDown || Date.now() - startedAt >= timings.warmupCapMs) {
				return;
			}
			const status = await httpStatus(target, timings.probeTimeoutMs, { signal });
			if (status !== undefined && status < CLOUDFLARE_ERROR_STATUS) {
				return;
			}
			await sleep(timings.warmupStepMs, undefined, { signal });
		}
	}

	/** Settles once `run` is registered — and in quick mode once its URL answers. */
	async function settle(run: Run, first: boolean): Promise<void> {
		const ready =
			mode === "token"
				? run.registeredAt
				: Promise.all([run.url, run.registeredAt]).then(() => undefined);
		const timeout = new AbortController();
		try {
			await Promise.race([
				abortable(ready, options.signal),
				run.exit.then(info => {
					throw exitedError(info, first);
				}),
				sleep(timings.urlTimeoutMs, undefined, { signal: timeout.signal }).then(() => {
					throw new TunnelError(
						"network",
						mode === "token"
							? "cloudflared did not register at the Cloudflare edge in time"
							: "cloudflared printed no Quick Tunnel URL in time",
						{ code: "E_CLOUDFLARED_URL" },
					);
				}),
			]);
		} finally {
			timeout.abort();
		}
		if (mode === "quick") {
			const target = await abortable(run.url, options.signal);
			url = target;
			// The gate watches the process too. A death behind it fails this
			// settle — the start, or a respawn's next backoff — so the handle
			// never carries the URL of a dead process.
			const gate = new AbortController();
			try {
				await Promise.race([
					abortable(warmUp(target, gate.signal), options.signal),
					run.exit.then(info => {
						throw exitedError(info, first);
					}),
				]);
			} finally {
				gate.abort();
			}
		}
		if (tornDown) {
			throw new TunnelError("aborted", "Tunnel connect aborted", { code: "E_ABORTED" });
		}
		if (!first) {
			if (mode === "quick") {
				events.push({ type: "url-changed", url: url ?? "" });
			}
			events.push({ type: "connected", session: `${String(run.id)}@edge`, routes: ["@"] });
		}
		announced = true;
	}

	/**
	 * Respawns the child with backoff until it settles again or the budget
	 * is spent. `exitInfo` is the death that started it: what "giving up"
	 * reports.
	 */
	async function supervise(exitInfo: ExitInfo): Promise<void> {
		// `tornDown` is closure state, changed from the outside.
		const alive = (): boolean => !tornDown;
		while (alive()) {
			const delay = timings.respawnDelaysMs[respawns];
			if (delay === undefined) {
				fatal(
					new TunnelError(
						"network",
						`cloudflared exited and ${String(respawns)} restarts did not keep it up — giving up`,
						{ code: "E_CLOUDFLARED_EXITED", cause: exitedError(exitInfo, false) },
					),
				);
				return;
			}
			respawns += 1;
			events.push({ type: "reconnecting", attempt: respawns, delayMs: delay });
			await sleep(delay);
			if (tornDown) {
				return;
			}
			respawning = true;
			const run = launch();
			current = run;
			try {
				await settle(run, false);
				return;
			} catch (error) {
				if (tornDown || (error instanceof TunnelError && error.kind === "aborted")) {
					return;
				}
				// It died again: the next backoff. Anything else is fatal.
				if (!(error instanceof TunnelError) || error.code !== "E_CLOUDFLARED_EXITED") {
					fatal(error);
					return;
				}
			} finally {
				respawning = false;
			}
		}
	}

	/** SIGTERM, a short grace, SIGKILL: never longer than the two caps together. */
	async function stopRun(run: Run): Promise<void> {
		const child = run.child;
		if (child.exitCode !== null || child.signalCode !== null) {
			return;
		}
		child.kill("SIGTERM");
		if (await settlesWithin(run.exit, timings.termGraceMs)) {
			return;
		}
		child.kill("SIGKILL");
		await settlesWithin(run.exit, timings.killGraceMs);
	}

	/** Kills the child and ends the stream — without a `stopped` event (a failure, not a stop). */
	const dispose = async (): Promise<void> => {
		tornDown = true;
		state = "stopped";
		stopWatchdog();
		if (current !== undefined) {
			await stopRun(current);
		}
		events.end();
	};

	const teardown = async (): Promise<void> => {
		if (tornDown) {
			return;
		}
		tornDown = true;
		state = "stopped";
		stopWatchdog();
		if (current !== undefined) {
			await stopRun(current);
		}
		events.push({ type: "stopped" });
		events.end();
		settleResolve();
	};

	const fatal = (error: unknown): void => {
		if (tornDown) {
			return;
		}
		void dispose();
		settleReject(error);
	};

	const check = async (): Promise<void> => {
		if (tornDown || respawning || state !== "connected" || url === undefined) {
			return;
		}
		// A target that fails directly is the problem itself: no restart.
		if (!(await probeHttp(`http://${options.host}:${String(options.port)}`))) {
			failures = 0;
			return;
		}
		// The Cloudflare edge answers `530` while the tunnel behind it is dead,
		// so here the STATUS is the signal, not the presence of a reply.
		const status = await httpStatus(url, timings.probeTimeoutMs);
		failures = status !== undefined && status < CLOUDFLARE_ERROR_STATUS ? 0 : failures + 1;
		if (
			failures >= timings.watchdogFailureLimit &&
			!tornDown &&
			!respawning &&
			current !== undefined
		) {
			failures = 0;
			// The process's own "Unregistered" line must not add a second
			// `disconnected` under this one.
			registered = false;
			events.push({
				type: "disconnected",
				reason: "health watchdog: the tunnel stopped serving, restarting cloudflared",
			});
			// The exit starts the usual respawn with backoff.
			await stopRun(current);
		}
	};

	const startWatchdog = (): void => {
		if (options.keepAlive === false || watchdog !== undefined) {
			return;
		}
		watchdog = setInterval(() => void check(), timings.watchdogIntervalMs);
		watchdog.unref?.();
	};

	// -- go ------------------------------------------------------------------
	options.signal?.addEventListener("abort", () => void teardown(), { once: true });

	const first = launch();
	current = first;
	try {
		await settle(first, true);
	} catch (error) {
		await dispose();
		throw error;
	}
	started = true;
	startWatchdog();

	return {
		get hostname() {
			return hostnameOf(url ?? "");
		},
		get urls() {
			return { "@": url ?? "" };
		},
		events: events.iterable,
		status: (): TunnelStatus => ({
			state,
			hostname: hostnameOf(url ?? ""),
			connections: 0,
			...(state === "connected" || lastError === undefined ? {} : { lastError }),
		}),
		close: teardown,
		closed: settleClosed,
	};
}
