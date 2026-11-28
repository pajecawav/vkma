// Prose-level touches that the Markdown itself should not carry: inline-code
// class, heading anchors, scrollable tables, and the home page's package index
// (built from its own "Пакеты" table — same facts, another setting).
import type { Element, ElementContent, Root as HastRoot } from "hast";
import { h, text, toText } from "../lib/hast";
import { t, type Locale } from "../lib/i18n";
import { iconHast } from "../lib/icons";
import { walkHast } from "../lib/unist";

export interface ProseOptions {
	/** Pages per package directory, for the home page's package index. */
	pkgCounts?: Record<string, number>;
}

interface ProseFile {
	history?: string[];
}

const elements = (node: Element | ElementContent, tagName: string): Element[] =>
	node.type === "element"
		? node.children.filter(
				(child): child is Element => child.type === "element" && child.tagName === tagName,
			)
		: [];

function firstElement(node: Element, tagName: string): Element | null {
	for (const child of node.children) {
		if (child.type !== "element") {
			continue;
		}
		if (child.tagName === tagName) {
			return child;
		}
		const nested = firstElement(child, tagName);
		if (nested) {
			return nested;
		}
	}
	return null;
}

function anchor(heading: Element, label: string): void {
	const id = heading.properties.id;
	if (typeof id !== "string" || !id) {
		return;
	}
	heading.children.push(
		h("a", { class: "hanchor", href: `#${id}`, ariaLabel: label, dataPagefindIgnore: "" }, [
			iconHast("anchor"),
		]),
	);
}

function packageIndex(
	table: Element,
	counts: Record<string, number>,
	pagesWord: string,
): Element | null {
	const head = firstElement(table, "th");
	if (!head || !/^(Пакет|Package)$/.test(toText(head))) {
		return null;
	}
	const items: Element[] = [];
	for (const row of elements(table, "tbody").flatMap(body => elements(body, "tr"))) {
		const [name, description] = elements(row, "td");
		const link = name ? firstElement(name, "a") : null;
		if (!name || !description || !link) {
			continue;
		}
		const title = toText(link).trim();
		const href = link.properties.href;
		if (!title || typeof href !== "string") {
			continue;
		}
		items.push(
			h("li", {}, [
				h("a", { class: "pk", href }, [
					h("span", { class: "pk-name" }, [text(title)]),
					// whitespace between grid items: invisible, and it keeps the
					// words apart for text extractors (search index, readers)
					text("\n"),
					h("span", { class: "pk-desc" }, [text(toText(description).trim())]),
					text("\n"),
					h("span", { class: "pk-count" }, [text(`${counts[title] ?? 0} ${pagesWord}`)]),
				]),
			]),
		);
	}
	return items.length ? h("ul", { className: ["pkg-index"] }, items) : null;
}

/** Rehype plugin; runs after the highlighter, before Astro's own heading pass. */
export function rehypeProse(options: ProseOptions = {}) {
	return (tree: HastRoot, file: ProseFile): void => {
		const locale: Locale = /\/src\/content\/docs\/en\//.test(file.history?.[0] ?? "")
			? "en"
			: "ru";
		const s = t(locale);
		walkHast(tree, (parent, node, index) => {
			if (node.type !== "element") {
				return;
			}
			switch (node.tagName) {
				case "code":
					if (!(parent.type === "element" && parent.tagName === "pre")) {
						node.properties.className = ["ic"];
					}
					break;
				case "h2":
				case "h3":
					anchor(node, s.anchor);
					break;
				case "table": {
					const index_ = options.pkgCounts
						? packageIndex(node, options.pkgCounts, s.pages)
						: null;
					parent.children[index] =
						index_ ??
						h("div", { className: ["table-wrap"], tabIndex: 0, role: "region" }, [
							node,
						]);
					break;
				}
			}
		});
	};
}
