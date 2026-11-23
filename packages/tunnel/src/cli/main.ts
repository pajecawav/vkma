/**
 * CLI entry logic: command dispatch, rendering, exit codes.
 *
 * Returns a process exit code instead of calling `process.exit`, so it is
 * testable. Exit codes:
 *   0 ok · 1 config/user · 2 network · 130 aborted (SIGINT)
 */

import net from "node:net";
import pkg from "../../package.json";
import { createTunnel } from "../core/tunnel.ts";
import type { TunnelEvent, TunnelHandle } from "../core/types.ts";
import { isTunnelError } from "../errors.ts";
import {
	defaultProfile,
	listProfileRecords,
	readProfileRecord,
	removeAllProfileRecords,
	removeProfileRecord,
	resolveTunnelConfig,
	tunnelDataDir,
	type ProfileRecord,
} from "../index.ts";
import { parseArgv, type ParsedArgs } from "./args.ts";
import { rivalHint } from "./conflict-hint.ts";
import { TunnelLogger, paint, type LoggerMode } from "./logger.ts";
import { openUrl } from "./opener.ts";
import { renderQr } from "./qr.ts";

const VERSION = pkg.version;

/** How long a clean stop may take after SIGINT before we stop waiting. */
const ABORT_GRACE_MS = 3000;
/** Hard cap on provider teardown in the CLI exit path. */
const CLOSE_TIMEOUT_MS = 3000;

export interface MainOptions {
	readonly env?: Record<string, string | undefined>;
	readonly cwd?: string;
	readonly stdout?: { write(text: string): void; isTTY?: boolean; columns?: number };
	readonly stderr?: { write(text: string): void };
	readonly signal?: AbortSignal;
	/** Identity-store root override (tests). */
	readonly dataDir?: string;
	/** Browser opener injection (tests); default opens a real tab. */
	readonly openUrl?: (url: string) => void;
	/** Tunnel factory injection (tests); default is the real `createTunnel`. */
	readonly createTunnel?: typeof createTunnel;
}

const HELP = `vkma-tunnel — public HTTPS tunnels for local VK Mini App servers (${VERSION})

Usage:
  vkma-tunnel [run] [flags]       Start a tunnel (default command) and
                                  print its URL. Ctrl+C stops it.
  vkma-tunnel reset               Drop the current profile's identity:
                                  the next run mints a new public URL
                                  (--profile <name> for another profile,
                                  --all for every profile)
  vkma-tunnel list                Stored profiles and their URLs
  vkma-tunnel status [profile]    Stored identity + live probes of the
                                  local target and the public URL

Flags:
  --provider <name>               Tunnel provider (default: opentunnel)
  --port <1-65535>                Local port to expose (default: 5173)
  --host <addr>                   Local host to forward to (default: localhost)
  --profile <name>                Identity profile; default: project
                                  directory name. A stable profile keeps
                                  the URL stable across runs
  --opentunnel-route <name>       opentunnel: "@" (apex, default) or a
                                  subdomain label
  --opentunnel-api <url>          opentunnel: self-hosted server endpoint
  --cloudflared-mode <quick|token>  cloudflared: a one-time Quick Tunnel URL
                                  (default) or a named tunnel by token
  --cloudflared-hostname <host>   cloudflared token mode: the dashboard's
                                  public hostname (the token: TUNNEL_TOKEN)
  --cloudflared-protocol <t>      cloudflared transport: http2 (default) or
                                  quic
  --cloudflared-binary <path>     cloudflared executable on PATH, or a path
  --config <path>                 Explicit config file (skips discovery)
  --qr                            Print a QR code of the tunnel URL
  --open                          Open the tunnel URL in the browser
  --no-keepalive                  Disable the periodic self-probe that
                                  keeps idle bridges from being dropped
  --no-host-rewrite               Disable the loopback proxy that rewrites
                                  the tunnel host to *.localhost (vite
                                  allowedHosts workaround)
  --json                          Machine-readable output (list/status,
                                  and NDJSON lifecycle events for run)
  --quiet, -q                     Errors only (the URL is still printed)
  --no-color                      Disable colors (also honors NO_COLOR)
  --help, -h / --version, -V

Config discovery (first found wins, walking up from cwd):
  vkma-tunnel.config.{ts,mts,js,mjs,json}

Layering: flags > config file > defaults.
Identity store: $XDG_DATA_HOME/vkma/tunnel/<profile>.json

Exit codes: 0 ok · 1 config/user · 2 network · 130 aborted
Docs: https://github.com/pajecawav/vkma (packages/tunnel)`;

/** Public URL of a route on a hostname (opentunnel rule, built neutrally). */
export function routeUrl(route: string, hostname: string): string {
	return route === "@" || route === "" ? `https://${hostname}` : `https://${route}.${hostname}`;
}

export async function main(argv: readonly string[], options: MainOptions = {}): Promise<number> {
	const env = options.env ?? process.env;
	const cwd = options.cwd ?? process.cwd();
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const dataDir = tunnelDataDir(env, options.dataDir);

	const parsed = parseArgv(argv);
	if (parsed.errors.length > 0) {
		for (const error of parsed.errors) {
			stderr.write(`error: ${error}\n`);
		}
		stderr.write("Run vkma-tunnel --help for usage.\n");
		return 1;
	}
	if (parsed.booleans.help || parsed.command === "help") {
		stdout.write(`${HELP}\n`);
		return 0;
	}
	if (parsed.booleans.version || parsed.command === "version") {
		stdout.write(`${VERSION}\n`);
		return 0;
	}

	const mode: LoggerMode = parsed.booleans.json
		? "json"
		: parsed.booleans.quiet
			? "quiet"
			: "pretty";
	const color =
		mode === "pretty" &&
		!parsed.booleans.noColor &&
		env["NO_COLOR"] === undefined &&
		stdout.isTTY === true;
	const logger = new TunnelLogger({ mode, color, stdout, stderr });

	try {
		switch (parsed.command) {
			case "reset":
				return await runReset(parsed, { dataDir, cwd, stdout, env, logger, color });
			case "list":
				return await runList(parsed, { dataDir, stdout, logger, color });
			case "status":
				return await runStatus(parsed, { dataDir, cwd, stdout, env, logger, color });
			default:
				return await runTunnel(parsed, {
					env,
					cwd,
					stdout,
					dataDir,
					color,
					logger,
					signal: options.signal,
					open: options.openUrl ?? openUrl,
					createTunnel: options.createTunnel ?? createTunnel,
				});
		}
	} catch (error) {
		logger.fail(error instanceof Error ? error.message : String(error));
		return isTunnelError(error) ? error.exitCode : 1;
	} finally {
		logger.dispose();
	}
}

interface RunContext {
	readonly dataDir: string;
	readonly cwd: string;
	readonly stdout: { write(text: string): void; isTTY?: boolean };
	readonly env: Record<string, string | undefined>;
	readonly logger: TunnelLogger;
	readonly color: boolean;
}

/** CLI flags -> config overrides (only what the user actually passed). */
function flagOverrides(parsed: ParsedArgs) {
	const overrides: Record<string, unknown> = {};
	if (parsed.values.provider !== undefined) {
		overrides["provider"] = parsed.values.provider;
	}
	if (parsed.values.port !== undefined) {
		overrides["port"] = parsed.values.port;
	}
	if (parsed.values.host !== undefined) {
		overrides["host"] = parsed.values.host;
	}
	if (parsed.values.profile !== undefined) {
		overrides["profile"] = parsed.values.profile;
	}
	if (parsed.values.opentunnel !== undefined) {
		// A provider's section: the resolver merges it into the file's key
		// by key — and rejects it beside another provider's id.
		overrides["opentunnel"] = parsed.values.opentunnel;
	}
	if (parsed.values.cloudflared !== undefined) {
		overrides["cloudflared"] = parsed.values.cloudflared;
	}
	return overrides;
}

/** Provisioning stages → human labels (opentunnel ids, provider-supplied). */
const STAGE_LABELS: Readonly<Record<string, string>> = {
	"checking-certificate": "Checking stored certificate",
	"creating-tunnel": "Creating tunnel",
	"generating-key": "Generating key",
	"generating-csr": "Generating certificate request",
	"resuming-certificate": "Resuming certificate",
	"requesting-certificate": "Requesting certificate",
	"waiting-certificate": "Waiting for certificate issuance",
	"saving-identity": "Saving identity",
};

async function runTunnel(
	parsed: ParsedArgs,
	context: {
		env: Record<string, string | undefined>;
		cwd: string;
		stdout: { write(text: string): void };
		dataDir: string;
		color: boolean;
		logger: TunnelLogger;
		signal?: AbortSignal;
		open: (url: string) => void;
		createTunnel: typeof createTunnel;
	},
): Promise<number> {
	const { logger, color } = context;
	const { config } = await resolveTunnelConfig({
		cwd: context.cwd,
		configPath: parsed.values.config,
		overrides: flagOverrides(parsed),
	});

	if (logger.json) {
		logger.emit({
			level: "info",
			event: "starting",
			message: "starting tunnel",
			data: { ...config },
		});
	} else {
		logger.spinnerStart("Starting tunnel…");
	}

	let bannerShown = false;
	let lastDisconnectReason: string | undefined;
	let lastStage: string | undefined;
	let conflictHintShown = false;
	/**
	 * The URL banner: for the initial URL, and again when the provider
	 * replaces it under the same handle (`url-changed` — a respawned
	 * cloudflared Quick Tunnel has a new hostname).
	 */
	let announce: (replaced: boolean) => void = () => undefined;
	const ownPid = process.pid;
	const hintProfile = config.profile ?? defaultProfile(context.cwd);
	const showConflictHint = (): void => {
		if (conflictHintShown) {
			return;
		}
		conflictHintShown = true;
		void readProfileRecord(context.dataDir, hintProfile)
			.then(record => {
				const hint = rivalHint(record, ownPid);
				if (hint !== undefined) {
					logger.warn(`  ${hint}`);
				}
			})
			.catch(() => undefined);
	};
	const handle = await context.createTunnel({
		...config,
		dataDir: context.dataDir,
		env: context.env,
		signal: context.signal,
		keepAlive: !parsed.booleans.noKeepAlive,
		hostRewrite: !parsed.booleans.noHostRewrite,
		pid: ownPid,
		onProgress: stage => {
			// The SDK repeats the current stage on every poll; dedupe so a
			// spinner swaps only on real transitions and non-TTY runs print
			// one line per stage.
			if (stage === lastStage) {
				return;
			}
			lastStage = stage;
			// Provisioning done — the bridge attach follows within moments
			// and the URL banner right after it. Flashing "Ready" (or a
			// "ready" line) buys nothing: keep the spinner honest instead.
			if (stage === "ready") {
				if (!logger.json) {
					logger.spinnerUpdate("Attaching bridge…");
				}
				return;
			}
			const label = STAGE_LABELS[stage] ?? stage;
			if (logger.json) {
				logger.emit({ level: "info", event: "progress", message: label, data: { stage } });
				return;
			}
			logger.spinnerStart(`${label}…`);
		},
		onWarning: message => {
			logger.warn(`  tunnel: ${message}`);
		},
		onEvent: event => {
			if (event.type === "disconnected") {
				lastDisconnectReason = event.reason;
				return;
			}
			if (event.type === "url-changed") {
				// The handle already carries the new hostname and URLs.
				announce(true);
				return;
			}
			if (event.type === "route-conflict") {
				showConflictHint();
			}
			// The first attach sequence (connecting/connected) is announced
			// by the URL banner itself.
			if (!bannerShown && (event.type === "connected" || event.type === "connecting")) {
				return;
			}
			renderEvent(event, logger, lastDisconnectReason);
		},
	});
	bannerShown = true;
	announce = (replaced: boolean): void => {
		if (logger.json) {
			logger.emit({
				level: "info",
				event: "url",
				message: handle.primaryUrl,
				data: {
					url: handle.primaryUrl,
					profile: handle.profile,
					hostname: handle.hostname,
					target: `${config.host}:${String(config.port)}`,
					provider: handle.provider,
					replaced,
				},
			});
			return;
		}
		// rawOut (not step): the URL is the one thing quiet mode must print.
		logger.rawOut("");
		if (replaced) {
			logger.rawOut(
				paint(
					"  tunnel: the URL was replaced — the previous one no longer works",
					"yellow",
					color,
				),
			);
		}
		logger.rawOut(
			`  ${paint("➜", "green", color)}  ${paint("tunnel", "bold", color)}  ${paint("→", "dim", color)}  ${paint(handle.primaryUrl, "cyan", color)}`,
		);
		logger.rawOut(
			paint(
				`    profile ${handle.profile} · target ${config.host}:${String(config.port)} · provider ${handle.provider}`,
				"dim",
				color,
			),
		);
		logger.rawOut("");
	};
	// The banner is the final word of the startup phase: stop the spinner
	// BEFORE printing it — rawOut only pauses/resumes, and a resumed
	// spinner would keep spinning under the printed URL forever.
	logger.spinnerStop();
	announce(false);
	// A Quick Tunnel is a one-time URL: say so while the user is looking
	// at it, not after they wired it into the VK app settings.
	if (handle.provider === "cloudflared" && config.cloudflared?.mode !== "token") {
		logger.warn(
			"  tunnel: Quick Tunnel — this URL is one-time: it changes on every start and takes up to a minute to warm up. For a stable URL use a named tunnel (--cloudflared-mode token).",
		);
		if (parsed.booleans.noHostRewrite) {
			// cloudflared left the public Host in place, as asked; its name is
			// new on every start, so only the suffix can be allowed up front.
			logger.warn(
				"  tunnel: host rewriting is off and a Quick Tunnel gets a new hostname on every start — allow the suffix in vite: server.allowedHosts: ['.trycloudflare.com']",
			);
		}
	}
	if (parsed.booleans.qr && !logger.json) {
		logger.rawOut(renderQr(handle.primaryUrl));
	}
	if (parsed.booleans.open) {
		context.open(handle.primaryUrl);
	}

	let exitCode: number;
	try {
		// Ctrl+C must never depend on the SDK settling `closed`: a bridge
		// stuck in a route-conflict retry loop (or a wedged teardown) would
		// otherwise hold the process hostage. After an abort, wait a
		// bounded grace for a clean stop, then leave regardless.
		await Promise.race([handle.closed, abortGrace(context.signal)]);
		// SIGINT is the normal exit for a foreground tunnel: the caller
		// aborts the signal, the provider closes the connection, `closed`
		// resolves.
		exitCode = context.signal?.aborted === true ? 130 : 0;
	} catch (error) {
		// Fatal tunnel failure: the error already surfaced as a `stopped`
		// event; keep the message on stderr with the mapped exit code.
		const message = error instanceof Error ? error.message : String(error);
		logger.fail(`tunnel stopped: ${message}`);
		exitCode = 2;
	} finally {
		await boundedClose(handle);
	}
	return exitCode;
}

/** Grace window after an abort for a clean SDK stop; resolves even without one. */
function abortGrace(signal: AbortSignal | undefined): Promise<"aborted"> {
	return new Promise(resolve => {
		if (signal === undefined) {
			return;
		}
		if (signal.aborted) {
			resolve("aborted");
			return;
		}
		signal.addEventListener(
			"abort",
			() => {
				const timer = setTimeout(() => resolve("aborted"), ABORT_GRACE_MS);
				timer.unref?.();
			},
			{ once: true },
		);
	});
}

/** Provider teardown with a hard cap: a hung SDK close must not wedge the CLI. */
function boundedClose(handle: TunnelHandle): Promise<void> {
	return new Promise(resolve => {
		const timer = setTimeout(() => resolve(undefined), CLOSE_TIMEOUT_MS);
		timer.unref?.();
		handle.close().then(
			() => {
				clearTimeout(timer);
				resolve(undefined);
			},
			() => {
				clearTimeout(timer);
				resolve(undefined);
			},
		);
	});
}

function renderEvent(event: TunnelEvent, logger: TunnelLogger, reason?: string): void {
	switch (event.type) {
		case "connecting":
			logger.emit({
				level: "debug",
				event: "connecting",
				message: `  tunnel: connecting (attempt ${String(event.attempt)})`,
				data: event,
			});
			break;
		case "reconnecting":
			logger.emit({
				level: "warn",
				event: "reconnecting",
				message: `  tunnel: reconnecting (attempt ${String(event.attempt)}, in ${String(event.delayMs)}ms)${reason === undefined ? "" : ` — ${reason}`}`,
				data: { ...event, reason },
			});
			break;
		case "connected":
			// Subsequent attaches (after a reconnect); the first one is
			// reported by the URL banner itself.
			logger.emit({
				level: "debug",
				event: "connected",
				message: "  tunnel: connected",
				data: event,
			});
			break;
		case "route-conflict":
			logger.emit({
				level: "warn",
				event: "route-conflict",
				message: `  tunnel: route held by another bridge (${event.routes.join(", ")}), taking over…`,
				data: event,
			});
			break;
		case "stopped":
			if (event.error !== undefined) {
				logger.emit({
					level: "error",
					event: "stopped",
					message: `  tunnel: stopped — ${event.error}`,
					data: event,
				});
			} else {
				logger.emit({
					level: "debug",
					event: "stopped",
					message: "  tunnel: stopped",
					data: event,
				});
			}
			break;
		default:
			// connection-opened/closed, certificate-renewed: interesting
			// for debugging, noise for a foreground tunnel. `disconnected`
			// folds its reason into the `reconnecting` line.
			break;
	}
}

async function resolveProfile(parsed: ParsedArgs, context: RunContext): Promise<string> {
	if (parsed.values.profile !== undefined) {
		return parsed.values.profile;
	}
	const { config } = await resolveTunnelConfig({
		cwd: context.cwd,
		configPath: parsed.values.config,
	});
	return config.profile ?? defaultProfile(context.cwd);
}

/**
 * What `reset` destroyed for one profile — said while the user can still
 * read it. An opentunnel identity's URL does not come back, and that is
 * easy to miss when a hint offered `reset` as a way out of an error.
 */
function resetMessage(
	record: ProfileRecord | undefined,
	profile: string,
): { step: string; note: string } {
	if (record === undefined) {
		// The file existed but held no hostname (a first run that never minted).
		return {
			step: `Removed the stored record for profile "${profile}"`,
			note: "It held no public URL yet.",
		};
	}
	const url = recordUrl(record);
	if (record.provider === "cloudflared") {
		return {
			step: `Removed the stored record for profile "${profile}" (${url})`,
			note: "The tunnel itself lives in your Cloudflare account and keeps its hostname; only the local record was forgotten.",
		};
	}
	return {
		step: `Removed identity for profile "${profile}" (${url})`,
		note: `${url} is gone for good — the next run mints a new URL. Anything still pointed at the old one must be updated.`,
	};
}

async function runReset(parsed: ParsedArgs, context: RunContext): Promise<number> {
	const { logger } = context;
	if (parsed.booleans.all) {
		const records = await listProfileRecords(context.dataDir);
		if (records.length === 0) {
			logger.info("No stored tunnel identities.");
			return 0;
		}
		for (const record of records) {
			const { step, note } = resetMessage(record, record.profile);
			logger.step(step);
			logger.info(note);
		}
		await removeAllProfileRecords(context.dataDir);
		return 0;
	}
	const profile = await resolveProfile(parsed, context);
	const record = await readProfileRecord(context.dataDir, profile);
	const removed = await removeProfileRecord(context.dataDir, profile);
	if (!removed) {
		logger.info(`No stored identity for profile "${profile}".`);
		return 0;
	}
	const { step, note } = resetMessage(record, profile);
	logger.step(step);
	logger.info(note);
	return 0;
}

function recordUrl(record: ProfileRecord): string {
	return routeUrl(record.lastRoute ?? "@", record.hostname);
}

async function runList(
	parsed: ParsedArgs,
	context: {
		dataDir: string;
		stdout: { write(text: string): void };
		logger: TunnelLogger;
		color: boolean;
	},
): Promise<number> {
	const records = await listProfileRecords(context.dataDir);
	if (parsed.booleans.json) {
		context.stdout.write(
			`${JSON.stringify(
				records.map(record => ({ ...record, url: recordUrl(record) })),
				null,
				"\t",
			)}\n`,
		);
		return 0;
	}
	if (records.length === 0) {
		context.logger.info("No stored tunnel identities — run vkma-tunnel to create one.");
		return 0;
	}
	const { color } = context;
	// The provider column appears only when it says something: every
	// opentunnel-only store looks exactly as before.
	const showProvider = records.some(
		record => record.provider !== undefined && record.provider !== "opentunnel",
	);
	const rows = records.map(record => ({
		profile: record.profile,
		url: recordUrl(record),
		target: record.lastTarget ?? "—",
		updated: record.updatedAt?.slice(0, 10) ?? "—",
		provider: record.provider === undefined ? "opentunnel" : record.provider,
	}));
	const widths = {
		profile: Math.max(...rows.map(row => row.profile.length), "profile".length),
		url: Math.max(...rows.map(row => row.url.length), "url".length),
		target: Math.max(...rows.map(row => row.target.length), "target".length),
		provider: Math.max(...rows.map(row => row.provider.length), "provider".length),
	};
	const providerHeader = showProvider ? `  ${"provider".padEnd(widths.provider)}` : "";
	const providerCell = (row: (typeof rows)[number]): string =>
		showProvider ? `  ${row.provider.padEnd(widths.provider)}` : "";
	// Pad on plain text, paint after: ANSI escapes are zero-width and must
	// not inflate the padding math.
	context.logger.rawOut(
		paint(
			`  ${"profile".padEnd(widths.profile)}  ${"url".padEnd(widths.url)}  ${"target".padEnd(widths.target)}${providerHeader}  updated`,
			"dim",
			color,
		),
	);
	for (const row of rows) {
		context.logger.rawOut(
			`  ${paint(row.profile.padEnd(widths.profile), "bold", color)}  ${paint(row.url.padEnd(widths.url), "cyan", color)}  ${row.target.padEnd(widths.target)}${providerCell(row)}  ${row.updated}`,
		);
	}
	return 0;
}

async function runStatus(
	parsed: ParsedArgs,
	context: {
		dataDir: string;
		cwd: string;
		stdout: { write(text: string): void };
		env: Record<string, string | undefined>;
		logger: TunnelLogger;
		color: boolean;
	},
): Promise<number> {
	const { logger, color } = context;
	const profile = parsed.profileArg ?? (await resolveProfile(parsed, context));
	const record = await readProfileRecord(context.dataDir, profile);
	if (record === undefined) {
		logger.info(`No stored tunnel for profile "${profile}" — run vkma-tunnel first.`);
		return 1;
	}

	const url = recordUrl(record);
	const [targetReachable, tunnelReachable] = await Promise.all([
		record.lastTarget === undefined ? Promise.resolve(false) : probeTarget(record.lastTarget),
		probeUrl(url),
	]);

	if (parsed.booleans.json) {
		context.stdout.write(
			`${JSON.stringify(
				{
					profile: record.profile,
					url,
					hostname: record.hostname,
					target: record.lastTarget ?? null,
					targetReachable,
					tunnelReachable,
					createdAt: record.createdAt ?? null,
					updatedAt: record.updatedAt ?? null,
				},
				null,
				"\t",
			)}\n`,
		);
		return 0;
	}

	const state = (ok: boolean, good: string, bad: string): string =>
		paint(ok ? good : bad, ok ? "green" : "red", color);
	logger.rawOut(`profile:    ${paint(record.profile, "bold", color)}`);
	logger.rawOut(`url:        ${paint(url, "cyan", color)}`);
	logger.rawOut(
		`target:     ${record.lastTarget ?? "—"} ${state(targetReachable, "(listening)", "(not reachable)")}`,
	);
	logger.rawOut(`tunnel:     ${state(tunnelReachable, "responding", "not responding")}`);
	if (record.createdAt !== undefined) {
		logger.rawOut(`created at: ${record.createdAt}`);
	}
	return 0;
}

/** TCP probe of a `host:port` target with a short deadline. */
async function probeTarget(target: string, timeoutMs = 1500): Promise<boolean> {
	const [host, portText] =
		target.lastIndexOf(":") === -1
			? [target, ""]
			: [target.slice(0, target.lastIndexOf(":")), target.slice(target.lastIndexOf(":") + 1)];
	const port = Number.parseInt(portText, 10);
	if (!Number.isInteger(port)) {
		return false;
	}
	return await new Promise<boolean>(resolve => {
		const socket = net.connect({ host, port });
		const finish = (ok: boolean): void => {
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(timeoutMs, () => finish(false));
		socket.once("connect", () => finish(true));
		socket.once("error", () => finish(false));
	});
}

/** HTTP probe of the public URL: any response (even 5xx) means the tunnel serves. */
async function probeUrl(url: string, timeoutMs = 2500): Promise<boolean> {
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(timeoutMs),
			redirect: "manual",
		});
		response.body?.cancel().catch(() => undefined);
		return true;
	} catch {
		return false;
	}
}
