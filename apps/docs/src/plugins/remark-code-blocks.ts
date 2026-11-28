import type { Element, Root as HastRoot, RootContent } from "hast";
// Code blocks in the style of nitro.build, derived from the content's own
// conventions — the Markdown source stays plain and byte-exact:
//
//   - a first comment line naming a file (`// vite.config.ts`, optionally
//     `— note`) becomes the block header and leaves the code;
//   - an npm command followed by `# или: pnpm add / yarn add / bun add`
//     becomes a package-manager tab group;
//   - anything else stays a plain block.
//
// A remark plugin: every `code` node is replaced by a ready-made hast figure,
// so the result does not depend on where the highlighter runs.
import type { Root as MdastRoot } from "mdast";
import { createHighlighter, type Highlighter, type ThemeRegistrationRaw } from "shiki";
import { h, text, toText } from "../lib/hast";
import { t, type Locale, type Strings } from "../lib/i18n";
import { copyButtonHast } from "../lib/icons";
import { walkMdast } from "../lib/unist";

/* ------------------------------------------------------------ palette */

type Palette = {
	fg: string;
	punct: string;
	comment: string;
	keyword: string;
	string: string;
	type: string;
};

// Quiet on purpose: two hues for what code means (keywords, strings), a third
// for names of things, grey for structure. Blue is the site accent.
// Comments and punctuation stay at or above 4.5:1 on the code ground in both
// themes: the docs explain inside comments.
const P: Record<"light" | "dark", Palette> = {
	light: {
		fg: "#24262d",
		punct: "#6a6e77",
		comment: "#686c75",
		keyword: "#0a5bd0",
		string: "#0f7a5a",
		type: "#6a45c7",
	},
	dark: {
		fg: "#e3e4e9",
		punct: "#8b8f99",
		comment: "#8a8f9a",
		keyword: "#6ea8ff",
		string: "#78d0a6",
		type: "#b79bff",
	},
};

function theme(name: "paper-light" | "paper-dark", p: Palette): ThemeRegistrationRaw {
	return {
		name,
		type: name === "paper-dark" ? "dark" : "light",
		fg: p.fg,
		bg: "transparent",
		settings: [
			{
				scope: ["punctuation", "keyword.operator", "meta.brace", "meta.delimiter"],
				settings: { foreground: p.punct },
			},
			{
				scope: ["comment", "punctuation.definition.comment"],
				settings: { foreground: p.comment, fontStyle: "italic" },
			},
			{
				scope: ["string", "punctuation.definition.string", "constant.character.escape"],
				settings: { foreground: p.string },
			},
			{
				scope: [
					"keyword",
					"storage.type",
					"storage.modifier",
					"constant.language",
					"variable.language.this",
					"constant.numeric",
					"support.constant",
					"entity.name.tag",
					"support.function.builtin",
					"support.command",
				],
				settings: { foreground: p.keyword },
			},
			{
				scope: [
					"entity.name.function",
					"support.function",
					"entity.name.type",
					"entity.name.class",
					"entity.name.interface",
					"entity.name.type.parameter",
					"entity.name.type.alias",
					"support.class",
					"support.type",
				],
				settings: { foreground: p.type },
			},
			{
				scope: ["support.type.property-name", "meta.mapping.key"],
				settings: { foreground: p.keyword },
			},
			{
				scope: [
					"string.unquoted.argument",
					"string.unquoted.shell",
					"string.unquoted.heredoc",
				],
				settings: { foreground: p.fg },
			},
			{
				scope: [
					"variable.other.property",
					"entity.other.attribute-name",
					"variable.parameter",
					"variable.other.constant",
				],
				settings: { foreground: p.fg },
			},
		],
	};
}

const LANG: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	sh: "bash",
	jsonc: "jsonc",
	json: "json",
	yaml: "yaml",
	css: "css",
	js: "javascript",
};

let highlighterPromise: Promise<Highlighter> | undefined;

function highlighter(): Promise<Highlighter> {
	highlighterPromise ??= createHighlighter({
		themes: [theme("paper-light", P.light), theme("paper-dark", P.dark)],
		langs: [...new Set(Object.values(LANG))],
	});
	return highlighterPromise;
}

// The command word of a shell line reads as a keyword (npm, npx, vkma-deploy…).
function paintCommand(pre: Element): void {
	const code = pre.children[0];
	if (!code || code.type !== "element") {
		return;
	}
	for (const line of code.children) {
		if (line.type !== "element") {
			continue;
		}
		const first = line.children[0];
		if (!first || first.type !== "element") {
			continue;
		}
		const word = toText(first);
		if (!/^[a-z@][\w@./-]*$/i.test(word)) {
			continue;
		}
		first.properties.style = `color:${P.light.keyword};--shiki-dark:${P.dark.keyword}`;
	}
}

async function highlighted(codeValue: string, lang: string): Promise<Element> {
	const hl = await highlighter();
	let pre: RootContent;
	try {
		const root: HastRoot = hl.codeToHast(codeValue, {
			lang: LANG[lang] ?? lang,
			themes: { light: "paper-light", dark: "paper-dark" },
		});
		pre = root.children[0];
	} catch {
		pre = h("pre", {}, [h("code", {}, [text(codeValue)])]);
	}
	if (pre.type !== "element") {
		throw new Error("code-blocks: shiki returned no <pre>");
	}
	pre.properties = { class: "shiki", tabIndex: 0 };
	if (lang === "sh") {
		paintCommand(pre);
	}
	return pre;
}

/* ------------------------------------------------------------- parsing */

export type PmId = "npm" | "pnpm" | "yarn" | "bun";

export interface PmVariant {
	id: PmId;
	label: string;
	code: string;
}

export interface ParsedBlock {
	lang: string;
	/** The code itself; a package-manager group carries it per variant instead. */
	code?: string;
	file?: { dir: string; base: string; ft: string };
	pm?: PmVariant[];
}

const PM_LABEL: Record<PmId, string> = { npm: "npm", pnpm: "pnpm", yarn: "yarn", bun: "bun" };

// Mirrors the repo convention: `npm …` plus a `# или: pnpm add / yarn add / bun add` line.
const convert = (line: string, pm: PmId): string => {
	let m: RegExpMatchArray | null;
	if ((m = line.match(/^(\s*)npm (?:install|i)(\s+-D|\s+--save-dev)?\b\s*(.*)$/))) {
		const dev = m[2] ? " -D" : "";
		return pm === "npm" ? line : `${m[1]}${pm} add${dev}${m[3] ? ` ${m[3]}` : ""}`;
	}
	if ((m = line.match(/^(\s*)npm create\s+(.*)$/))) {
		return pm === "npm" ? line : `${m[1]}${pm} create ${m[2]}`;
	}
	if ((m = line.match(/^(\s*)npx\s+(.*)$/))) {
		const run: Record<PmId, string> = {
			npm: "npx",
			pnpm: "pnpm dlx",
			yarn: "yarn dlx",
			bun: "bunx",
		};
		return `${m[1]}${run[pm]} ${m[2]}`;
	}
	if ((m = line.match(/^(\s*)npm run\s+(.*)$/))) {
		const run: Record<PmId, string> = {
			npm: "npm run",
			pnpm: "pnpm",
			yarn: "yarn",
			bun: "bun run",
		};
		return `${m[1]}${run[pm]} ${m[2]}`;
	}
	return line;
};

const ALT_LINE = /^# (?:или|or):/;
const FILE_COMMENT =
	/^\s*(?:\/\/|#)\s*([^\s—]+?\.(?:ts|tsx|js|jsx|mjs|json|jsonc|yaml|yml|css|html))\s*(?:—\s*(.+?))?\s*$/;

const FT: Record<string, string> = {
	ts: "TS",
	tsx: "TSX",
	js: "JS",
	mjs: "JS",
	json: "{}",
	jsonc: "{}",
	yaml: "YML",
	yml: "YML",
	css: "CSS",
	html: "HTML",
};

export function parseBlock(lang: string, source: string): ParsedBlock {
	const lines = source.split("\n");
	const altIndex = lines.findIndex(line => ALT_LINE.test(line));
	if (lang === "sh" && altIndex !== -1) {
		const alt = lines[altIndex];
		const ids: PmId[] = [
			"npm",
			...(["pnpm", "yarn", "bun"] as const).filter(id => new RegExp(`\\b${id}\\b`).test(alt)),
		];
		const kept = lines.filter(line => !ALT_LINE.test(line)).join("\n");
		return {
			lang,
			pm: ids.map(id => ({
				id,
				label: PM_LABEL[id],
				code: kept
					.split("\n")
					.map(line => convert(line, id))
					.join("\n"),
			})),
		};
	}
	if (lang !== "sh") {
		const m = lines[0].match(FILE_COMMENT);
		if (m) {
			const file = m[1];
			const rest = lines.slice(1);
			if (m[2]) {
				rest.unshift(`// ${m[2]}`);
			}
			const base = file.split("/").pop() ?? file;
			return {
				lang,
				code: rest.join("\n"),
				file: {
					dir: file.slice(0, -base.length),
					base,
					ft: FT[base.split(".").pop()?.toLowerCase() ?? ""] ?? "FILE",
				},
			};
		}
	}
	return { lang, code: source };
}

/* ------------------------------------------------------------- figure */

let counter = 0;

export async function codeFigure(
	block: ParsedBlock,
	s: Pick<Strings, "copy" | "pm">,
): Promise<Element> {
	if (block.pm) {
		const uid = `cg${++counter}`;
		const tabs = h(
			"div",
			{ class: "code-tabs", role: "tablist", ariaLabel: s.pm, dataPagefindIgnore: "" },
			[
				...block.pm.map((variant, index) =>
					h(
						"button",
						{
							type: "button",
							role: "tab",
							id: `${uid}-t${index}`,
							ariaSelected: index === 0 ? "true" : "false",
							ariaControls: [`${uid}-p${index}`],
							tabIndex: index === 0 ? 0 : -1,
							dataPm: variant.id,
						},
						[text(variant.label)],
					),
				),
				copyButtonHast(s.copy),
			],
		);
		const panels = await Promise.all(
			block.pm.map(async (variant, index) =>
				h(
					"div",
					{
						class: "code-panel",
						role: "tabpanel",
						id: `${uid}-p${index}`,
						ariaLabelledby: [`${uid}-t${index}`],
						dataPm: variant.id,
					},
					[await highlighted(variant.code, block.lang)],
				),
			),
		);
		return h("figure", { class: "code has-head code-group", dataLang: block.lang }, [
			tabs,
			h("div", { class: "code-body" }, panels),
		]);
	}
	const pre = await highlighted(block.code ?? "", block.lang);
	if (block.file) {
		const head = h("figcaption", { class: "code-head" }, [
			h("span", { class: "code-file", dataPagefindIgnore: "" }, [
				h("span", { class: "ft" }, [text(block.file.ft)]),
				...(block.file.dir
					? [h("span", { class: "code-path" }, [text(block.file.dir)])]
					: []),
				h("span", { class: "code-name" }, [text(block.file.base)]),
			]),
			copyButtonHast(s.copy),
		]);
		return h("figure", { class: "code has-head", dataLang: block.lang }, [
			head,
			h("div", { class: "code-body" }, [pre]),
		]);
	}
	return h("figure", { class: "code", dataLang: block.lang }, [
		h("div", { class: "code-body" }, [pre, copyButtonHast(s.copy)]),
	]);
}

/* ------------------------------------------------------------- plugin */

interface MarkdownFile {
	history?: string[];
}

const localeOfFile = (file: MarkdownFile): Locale =>
	/\/src\/content\/docs\/en\//.test(file.history?.[0] ?? "") ? "en" : "ru";

/** Remark plugin: turns every fenced block into its rendered figure. */
export function remarkCodeBlocks() {
	return async (tree: MdastRoot, file: MarkdownFile): Promise<void> => {
		const s = t(localeOfFile(file));
		counter = 0;
		const jobs: Promise<void>[] = [];
		walkMdast(tree, (parent, node, index) => {
			if (node.type !== "code") {
				return;
			}
			jobs.push(
				codeFigure(parseBlock(node.lang ?? "", node.value), s).then(figure => {
					parent.children[index] = {
						type: "paragraph",
						children: [],
						data: {
							hName: figure.tagName,
							hProperties: figure.properties,
							hChildren: figure.children,
						},
					};
				}),
			);
		});
		await Promise.all(jobs);
	};
}
