/**
 * Hand-rolled argv parser: subcommands, value flags, --flag=value,
 * --no-* negations, and short options. Unknown flags are errors, not noise.
 */

export type Command =
	| "deploy"
	| "login"
	| "logout"
	| "config"
	| "init"
	| "completions"
	| "help"
	| "version";

const COMMANDS: readonly Command[] = [
	"deploy",
	"login",
	"logout",
	"config",
	"init",
	"completions",
	"help",
	"version",
];

/** Endpoint platforms accepted by `--endpoints` (init). */
export const ENDPOINT_PLATFORMS = ["mobile", "mvk", "web"] as const;
export type EndpointPlatform = (typeof ENDPOINT_PLATFORMS)[number];

const VALUE_FLAGS = new Set([
	"--env",
	"--config",
	"--timeout",
	"--test-group",
	"--proxy",
	// init-only; main() rejects them for every other command
	"--app-id",
	"--static-path",
	"--endpoints",
]);
const BOOLEAN_FLAGS = new Set([
	"--dry-run",
	"--interactive",
	"--yes",
	"--verbose",
	"--quiet",
	"--json",
	"--no-color",
	"--help",
	"--version",
	"--update-prod",
	"--no-update-prod",
	"--update-dev",
	"--no-update-dev",
]);
const SHORT_FLAGS = new Map([
	["-v", "--verbose"],
	["-q", "--quiet"],
	["-y", "--yes"],
	["-h", "--help"],
	["-V", "--version"],
]);

export interface ParsedArgs {
	readonly command: Command;
	readonly shell?: string;
	readonly values: {
		readonly env?: string;
		readonly config?: string;
		readonly timeout?: number;
		readonly testGroup?: string;
		readonly proxy?: string;
		/** init only */
		readonly appId?: number;
		/** init only */
		readonly staticPath?: string;
		/** init only */
		readonly endpoints?: readonly EndpointPlatform[];
	};
	readonly booleans: {
		readonly dryRun: boolean;
		readonly interactive: boolean;
		readonly yes: boolean;
		readonly verbose: boolean;
		readonly quiet: boolean;
		readonly json: boolean;
		readonly noColor: boolean;
		readonly help: boolean;
		readonly version: boolean;
		readonly updateProd?: boolean;
		readonly updateDev?: boolean;
	};
	readonly errors: readonly string[];
}

export function parseArgv(argv: readonly string[]): ParsedArgs {
	const errors: string[] = [];
	let command: Command | undefined;
	let shell: string | undefined;
	let env: string | undefined;
	let config: string | undefined;
	let timeout: number | undefined;
	let testGroup: string | undefined;
	let proxy: string | undefined;
	let dryRun = false;
	let interactive = false;
	let yes = false;
	let verbose = false;
	let quiet = false;
	let json = false;
	let noColor = false;
	let help = false;
	let version = false;
	let updateProd: boolean | undefined;
	let updateDev: boolean | undefined;
	let appId: number | undefined;
	let staticPath: string | undefined;
	let endpoints: EndpointPlatform[] | undefined;

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
					if (command === "completions") {
						const next = argv[i + 1];
						if (next !== undefined && !next.startsWith("-")) {
							shell = next;
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
			// discovery would deploy from a config the user never pointed at.
			if (value === undefined || value === "" || value.startsWith("-")) {
				errors.push(`Flag ${resolved} requires a value`);
				continue;
			}
			if (inlineValue === undefined) {
				i += 1;
			}
			switch (resolved) {
				case "--env":
					env = value;
					break;
				case "--config":
					config = value;
					break;
				case "--test-group":
					testGroup = value;
					break;
				case "--proxy":
					proxy = value;
					break;
				case "--static-path":
					staticPath = value;
					break;
				case "--app-id": {
					const parsed = Number.parseInt(value, 10);
					// Round-trip like --timeout: "--app-id 1e3" must fail
					// instead of quietly becoming app 1.
					if (
						!Number.isInteger(parsed) ||
						parsed < 1 ||
						String(parsed) !== value.trim()
					) {
						errors.push(
							`--app-id expects a positive integer, got ${JSON.stringify(value)}`,
						);
					} else {
						appId = parsed;
					}
					break;
				}
				case "--endpoints": {
					const isPlatform = (part: string): part is EndpointPlatform =>
						(ENDPOINT_PLATFORMS as readonly string[]).includes(part);
					const platforms = value
						.split(",")
						.map(part => part.trim())
						.filter(part => part !== "");
					const known = platforms.filter(isPlatform);
					if (known.length !== platforms.length || known.length === 0) {
						errors.push(
							`--endpoints expects a comma-separated list of platforms (${ENDPOINT_PLATFORMS.join(", ")}), got ${JSON.stringify(value)}`,
						);
					} else {
						endpoints = [...new Set(known)];
					}
					break;
				}
				case "--timeout": {
					const parsed = Number.parseInt(value, 10);
					// Round-trip: "--timeout 1e3" must fail instead of
					// truncating to a 1-second deadline.
					if (
						!Number.isInteger(parsed) ||
						parsed < 1 ||
						String(parsed) !== value.trim()
					) {
						errors.push(
							`--timeout expects a positive integer (seconds), got ${JSON.stringify(value)}`,
						);
					} else {
						timeout = parsed;
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
			case "--dry-run":
				dryRun = true;
				break;
			case "--interactive":
				interactive = true;
				break;
			case "--yes":
				yes = true;
				break;
			case "--verbose":
				verbose = true;
				break;
			case "--quiet":
				quiet = true;
				break;
			case "--json":
				json = true;
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
			case "--update-prod":
				updateProd = true;
				break;
			case "--no-update-prod":
				updateProd = false;
				break;
			case "--update-dev":
				updateDev = true;
				break;
			case "--no-update-dev":
				updateDev = false;
				break;
			default:
				errors.push(`Flag ${resolved} is not supported`);
		}
	}

	return {
		command: command ?? "deploy",
		shell,
		values: { env, config, timeout, testGroup, proxy, appId, staticPath, endpoints },
		booleans: {
			dryRun,
			interactive,
			yes,
			verbose,
			quiet,
			json,
			noColor,
			help,
			version,
			updateProd,
			updateDev,
		},
		errors,
	};
}
