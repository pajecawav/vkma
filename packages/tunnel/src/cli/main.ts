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
import { paint } from "./color.ts";
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
  --host <addr>                   Local host to forward to (default: 127.0.0.1)
  --route <name>                  "@" (apex, default) or a subdomain label
  --profile <name>                Identity profile; default: project
                                  directory name. A stable profile keeps
                                  the URL stable across runs
  --api <url>                     Self-hosted provider endpoint
  --config <path>                 Explicit config file (skips discovery)
  --qr                            Print a QR code of the tunnel URL
  --open                          Open the tunnel URL in the browser
  --no-keepalive                  Disable the periodic self-probe that
                                  keeps idle bridges from being dropped
  --json                          Machine-readable output (list/status)
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

	const color =
		!parsed.booleans.noColor &&
		!parsed.booleans.json &&
		env["NO_COLOR"] === undefined &&
		stdout.isTTY === true;

	try {
		switch (parsed.command) {
			case "reset":
				return await runReset(parsed, { dataDir, cwd, stdout, env });
			case "list":
				return await runList(parsed, { dataDir, stdout });
			case "status":
				return await runStatus(parsed, { dataDir, cwd, stdout, env });
			default:
				return await runTunnel(parsed, {
					env,
					cwd,
					stdout,
					stderr,
					dataDir,
					color,
					signal: options.signal,
					open: options.openUrl ?? openUrl,
					createTunnel: options.createTunnel ?? createTunnel,
				});
		}
	} catch (error) {
		if (isTunnelError(error)) {
			stderr.write(`error: ${error.message}\n`);
			return error.exitCode;
		}
		stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

interface RunContext {
	readonly dataDir: string;
	readonly cwd: string;
	readonly stdout: { write(text: string): void; isTTY?: boolean };
	readonly env: Record<string, string | undefined>;
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
	if (parsed.values.route !== undefined) {
		overrides["route"] = parsed.values.route;
	}
	if (parsed.values.profile !== undefined) {
		overrides["profile"] = parsed.values.profile;
	}
	if (parsed.values.api !== undefined) {
		overrides["api"] = parsed.values.api;
	}
	return overrides;
}

async function runTunnel(
	parsed: ParsedArgs,
	context: {
		env: Record<string, string | undefined>;
		cwd: string;
		stdout: { write(text: string): void };
		stderr: { write(text: string): void };
		dataDir: string;
		color: boolean;
		signal?: AbortSignal;
		open: (url: string) => void;
		createTunnel: typeof createTunnel;
	},
): Promise<number> {
	const { config } = await resolveTunnelConfig({
		cwd: context.cwd,
		configPath: parsed.values.config,
		overrides: flagOverrides(parsed),
	});

	let bannerShown = false;
	let lastDisconnectReason: string | undefined;
	const handle = await context.createTunnel({
		...config,
		dataDir: context.dataDir,
		env: context.env,
		signal: context.signal,
		keepAlive: !parsed.booleans.noKeepAlive,
		onProgress: stage => renderProgress(stage, context),
		onEvent: event => {
			if (event.type === "disconnected") {
				lastDisconnectReason = event.reason;
				return;
			}
			// The first attach is announced by the URL banner itself.
			if (event.type === "connected" && !bannerShown) {
				return;
			}
			renderEvent(event, context, lastDisconnectReason);
		},
	});
	bannerShown = true;

	const url = paint(handle.primaryUrl, "cyan", context.color);
	context.stdout.write(
		`${paint("➜", "green", context.color)}  ${paint("tunnel", "bold", context.color)}  ${paint("→", "dim", context.color)}  ${url}\n`,
	);
	context.stdout.write(
		paint(
			`  profile ${handle.profile} · target ${config.host}:${String(config.port)} · provider ${handle.provider}\n`,
			"dim",
			context.color,
		),
	);
	if (parsed.booleans.qr) {
		context.stdout.write(renderQr(handle.primaryUrl));
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
		context.stderr.write(`error: tunnel stopped: ${message}\n`);
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

function renderProgress(
	stage: string,
	context: { stdout: { write(text: string): void }; color: boolean },
): void {
	context.stdout.write(paint(`  tunnel: ${stage}…\n`, "dim", context.color));
}

function renderEvent(
	event: TunnelEvent,
	context: { stdout: { write(text: string): void }; color: boolean },
	reason?: string,
): void {
	switch (event.type) {
		case "connecting":
			context.stdout.write(
				paint(
					`  tunnel: connecting (attempt ${String(event.attempt)})\n`,
					"dim",
					context.color,
				),
			);
			break;
		case "reconnecting":
			context.stdout.write(
				paint(
					`  tunnel: reconnecting (attempt ${String(event.attempt)}, in ${String(event.delayMs)}ms)${reason === undefined ? "" : ` — ${reason}`}\n`,
					"yellow",
					context.color,
				),
			);
			break;
		case "connected":
			// Subsequent attaches (after a reconnect); the first one is
			// reported by the URL banner itself.
			context.stdout.write(paint("  tunnel: connected\n", "dim", context.color));
			break;
		case "route-conflict":
			context.stdout.write(
				paint(
					`  tunnel: route held by another bridge (${event.routes.join(", ")}), taking over…\n`,
					"yellow",
					context.color,
				),
			);
			break;
		case "stopped":
			if (event.error !== undefined) {
				context.stdout.write(
					paint(`  tunnel: stopped — ${event.error}\n`, "red", context.color),
				);
			} else {
				context.stdout.write(paint("  tunnel: stopped\n", "dim", context.color));
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

async function runReset(parsed: ParsedArgs, context: RunContext): Promise<number> {
	if (parsed.booleans.all) {
		const removed = await removeAllProfileRecords(context.dataDir);
		if (removed.length === 0) {
			context.stdout.write("No stored tunnel identities.\n");
			return 0;
		}
		for (const profile of removed) {
			context.stdout.write(`Removed identity for profile "${profile}"\n`);
		}
		context.stdout.write("Next runs mint fresh public URLs.\n");
		return 0;
	}
	const profile = await resolveProfile(parsed, context);
	const removed = await removeProfileRecord(context.dataDir, profile);
	if (!removed) {
		context.stdout.write(`No stored identity for profile "${profile}".\n`);
		return 0;
	}
	context.stdout.write(`Removed identity for profile "${profile}"\n`);
	context.stdout.write("The next run mints a fresh public URL.\n");
	return 0;
}

function recordUrl(record: ProfileRecord): string {
	return routeUrl(record.lastRoute ?? "@", record.hostname);
}

async function runList(
	parsed: ParsedArgs,
	context: { dataDir: string; stdout: { write(text: string): void } },
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
		context.stdout.write("No stored tunnel identities — run vkma-tunnel to create one.\n");
		return 0;
	}
	const rows = records.map(record => ({
		profile: record.profile,
		url: recordUrl(record),
		target: record.lastTarget ?? "—",
		updated: record.updatedAt?.slice(0, 10) ?? "—",
	}));
	const widths = {
		profile: Math.max(...rows.map(row => row.profile.length), "profile".length),
		url: Math.max(...rows.map(row => row.url.length), "url".length),
		target: Math.max(...rows.map(row => row.target.length), "target".length),
	};
	context.stdout.write(
		`  ${"profile".padEnd(widths.profile)}  ${"url".padEnd(widths.url)}  ${"target".padEnd(widths.target)}  updated\n`,
	);
	for (const row of rows) {
		context.stdout.write(
			`  ${row.profile.padEnd(widths.profile)}  ${row.url.padEnd(widths.url)}  ${row.target.padEnd(widths.target)}  ${row.updated}\n`,
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
	},
): Promise<number> {
	const profile = parsed.profileArg ?? (await resolveProfile(parsed, context));
	const record = await readProfileRecord(context.dataDir, profile);
	if (record === undefined) {
		context.stdout.write(
			`No stored tunnel for profile "${profile}" — run vkma-tunnel first.\n`,
		);
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

	context.stdout.write(`profile:    ${record.profile}\n`);
	context.stdout.write(`url:        ${url}\n`);
	context.stdout.write(
		`target:     ${record.lastTarget ?? "—"} ${targetReachable ? "(listening)" : "(not reachable)"}\n`,
	);
	context.stdout.write(`tunnel:     ${tunnelReachable ? "responding" : "not responding"}\n`);
	if (record.createdAt !== undefined) {
		context.stdout.write(`created at: ${record.createdAt}\n`);
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
