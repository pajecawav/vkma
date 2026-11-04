export interface CliArgs {
	/** Positional target directory; null when not given (resolved later). */
	targetDir: string | null;
	preset: string | undefined;
	pm: string | undefined;
	install: boolean;
	git: boolean;
	help: boolean;
}

export class ArgsError extends Error {}

/**
 * Hand-rolled flag parser. The CLI surface is five flags, a parser library
 * would outweigh it. Supports `--flag value` and `--flag=value`; everything
 * after a bare `--` is ignored (npm forwards it from `npm create`).
 */
export function parseArgs(argv: readonly string[]): CliArgs {
	const args: CliArgs = {
		targetDir: null,
		preset: undefined,
		pm: undefined,
		install: true,
		git: true,
		help: false,
	};

	let positionalAllowed = true;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--") {
			positionalAllowed = false;
			continue;
		}
		if (!positionalAllowed) {
			continue;
		}
		if (!arg.startsWith("-")) {
			if (args.targetDir !== null) {
				throw new ArgsError(`Unexpected second positional argument: ${arg}`);
			}
			args.targetDir = arg;
			continue;
		}

		const next = () => {
			const value = argv[++i];
			if (value === undefined || value.startsWith("-")) {
				throw new ArgsError(`${arg} expects a value`);
			}
			return value;
		};

		if (arg === "--help" || arg === "-h") {
			args.help = true;
		} else if (arg === "--preset") {
			args.preset = next();
		} else if (arg.startsWith("--preset=")) {
			args.preset = arg.slice("--preset=".length);
		} else if (arg === "--pm") {
			args.pm = next();
		} else if (arg.startsWith("--pm=")) {
			args.pm = arg.slice("--pm=".length);
		} else if (arg === "--no-install") {
			args.install = false;
		} else if (arg === "--no-git") {
			args.git = false;
		} else {
			throw new ArgsError(`Unknown flag: ${arg}`);
		}
	}

	return args;
}
