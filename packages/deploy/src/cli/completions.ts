/**
 * Static shell completion scripts (bash, zsh, fish).
 * No dynamic completion: the command set is small and stable.
 */

export const COMPLETION_SHELLS = ["bash", "zsh", "fish"] as const;
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

const COMMANDS = ["deploy", "login", "logout", "config", "completions"];
const FLAGS = [
	"--env",
	"--config",
	"--timeout",
	"--test-group",
	"--dry-run",
	"--interactive",
	"--update-prod",
	"--no-update-prod",
	"--update-dev",
	"--no-update-dev",
	"--verbose",
	"--quiet",
	"--json",
	"--no-color",
	"--help",
	"--version",
];

export function completionScript(shell: string): string {
	switch (shell) {
		case "bash":
			return [
				"# vkma-deploy bash completion",
				"_vkma_deploy_completions() {",
				`  local commands="${COMMANDS.join(" ")}"`,
				`  local flags="${FLAGS.join(" ")}"`,
				"  if [[ $COMP_CWORD -eq 1 ]]; then",
				'    COMPREPLY=( $(compgen -W "$commands" -- "$2") )',
				"  else",
				'    COMPREPLY=( $(compgen -W "$flags" -- "$2") )',
				"  fi",
				"}",
				"complete -F _vkma_deploy_completions vkma-deploy",
				"",
			].join("\n");
		case "zsh":
			return [
				"#compdef vkma-deploy",
				"# vkma-deploy zsh completion",
				"_vkma-deploy() {",
				"  _arguments -C \\",
				`    "1: :(${COMMANDS.join(" ")})" \\`,
				`    "*: :(${FLAGS.join(" ")})"`,
				"}",
				'_vkma-deploy "$@"',
				"",
			].join("\n");
		case "fish":
			return [
				"# vkma-deploy fish completion",
				...COMMANDS.map(
					command => `complete -c vkma-deploy -n '__fish_use_subcommand' -a '${command}'`,
				),
				...FLAGS.map(flag => `complete -c vkma-deploy -l '${flag.replace("--", "")}'`),
				"",
			].join("\n");
		default:
			throw new Error(
				`Unsupported shell "${shell}" — expected one of: ${COMPLETION_SHELLS.join(", ")}`,
			);
	}
}
