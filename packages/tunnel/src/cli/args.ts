/**
 * Hand-rolled argv parser: subcommands, value flags, --flag=value, short
 * options. Unknown flags are errors, not noise. (Same shape as
 * @vkma.dev/deploy's parser, minus the deploy-specific flags.)
 */

export type Command = "run" | "reset" | "list" | "status" | "help" | "version";

const COMMANDS: readonly Command[] = ["run", "reset", "list", "status", "help", "version"];

const VALUE_FLAGS = new Set([
	"--provider",
	"--port",
	"--host",
	"--route",
	"--profile",
	"--config",
	"--api",
]);
const BOOLEAN_FLAGS = new Set([
	"--qr",
	"--open",
	"--all",
	"--no-keepalive",
	"--json",
	"--quiet",
	"--no-color",
	"--help",
	"--version",
]);
const SHORT_FLAGS = new Map([
	["-h", "--help"],
	["-q", "--quiet"],
	["-V", "--version"],
]);

export interface ParsedArgs {
	readonly command: Command;
	/** Positional profile for `status <profile>`. */
	readonly profileArg?: string;
	readonly values: {
		readonly provider?: string;
		readonly port?: number;
		readonly host?: string;
		readonly route?: string;
		readonly profile?: string;
		readonly config?: string;
		readonly api?: string;
	};
	readonly booleans: {
		readonly qr: boolean;
		readonly open: boolean;
		/** reset only: clear every profile, not just the current one. */
		readonly all: boolean;
		/** Disable the periodic self-probe that keeps idle bridges from being dropped. */
		readonly noKeepAlive: boolean;
		readonly json: boolean;
		readonly quiet: boolean;
		readonly noColor: boolean;
		readonly help: boolean;
		readonly version: boolean;
	};
	readonly errors: readonly string[];
}

export function parseArgv(argv: readonly string[]): ParsedArgs {
	const errors: string[] = [];
	let command: Command | undefined;
	let profileArg: string | undefined;
	let provider: string | undefined;
	let port: number | undefined;
	let host: string | undefined;
	let route: string | undefined;
	let profile: string | undefined;
	let config: string | undefined;
	let api: string | undefined;
	let qr = false;
	let open = false;
	let all = false;
	let noKeepAlive = false;
	let quiet = false;
	let json = false;
	let noColor = false;
	let help = false;
	let version = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? "";
		if (!arg.startsWith("-")) {
			if (command === undefined) {
				if (!COMMANDS.includes(arg as Command)) {
					errors.push(
						`Unknown command "${arg}" — expected one of: ${COMMANDS.join(", ")}`,
					);
				} else {
					command = arg as Command;
					if (command === "status") {
						const next = argv[i + 1];
						if (next !== undefined && !next.startsWith("-")) {
							profileArg = next;
							i += 1;
						}
					}
				}
			} else {
				errors.push(`Unexpected positional argument "${arg}"`);
			}
			continue;
		}

		let flag = arg;
		let inlineValue: string | undefined;
		const eq = arg.indexOf("=");
		if (eq !== -1) {
			flag = arg.slice(0, eq);
			inlineValue = arg.slice(eq + 1);
		}
		const resolved = SHORT_FLAGS.get(flag) ?? flag;

		if (VALUE_FLAGS.has(resolved)) {
			const value = inlineValue ?? argv[i + 1];
			// Empty counts as missing: `--config=` silently falling back to
			// discovery would tunnel from a config the user never pointed at.
			if (value === undefined || value === "" || value.startsWith("-")) {
				errors.push(`Flag ${resolved} requires a value`);
				continue;
			}
			if (inlineValue === undefined) {
				i += 1;
			}
			switch (resolved) {
				case "--provider":
					provider = value;
					break;
				case "--host":
					host = value;
					break;
				case "--route":
					route = value;
					break;
				case "--profile":
					profile = value;
					break;
				case "--config":
					config = value;
					break;
				case "--api":
					api = value;
					break;
				case "--port": {
					const parsed = Number.parseInt(value, 10);
					// Round-trip: "--port 5e3" must fail instead of quietly
					// tunneling port 5.
					if (
						!Number.isInteger(parsed) ||
						parsed < 1 ||
						parsed > 65535 ||
						String(parsed) !== value.trim()
					) {
						errors.push(
							`--port expects a port number 1-65535, got ${JSON.stringify(value)}`,
						);
					} else {
						port = parsed;
					}
					break;
				}
				default:
					errors.push(`Flag ${resolved} is not supported`);
			}
			continue;
		}

		if (!BOOLEAN_FLAGS.has(resolved)) {
			errors.push(`Unknown flag "${arg}" — run with --help to see available options`);
			continue;
		}
		switch (resolved) {
			case "--qr":
				qr = true;
				break;
			case "--open":
				open = true;
				break;
			case "--all":
				all = true;
				break;
			case "--no-keepalive":
				noKeepAlive = true;
				break;
			case "--json":
				json = true;
				break;
			case "--quiet":
				quiet = true;
				break;
			case "--no-color":
				noColor = true;
				break;
			case "--help":
				help = true;
				break;
			case "--version":
				version = true;
				break;
			default:
				errors.push(`Flag ${resolved} is not supported`);
		}
	}

	return {
		command: command ?? "run",
		profileArg,
		values: { provider, port, host, route, profile, config, api },
		booleans: { qr, open, all, noKeepAlive, json, quiet, noColor, help, version },
		errors,
	};
}
