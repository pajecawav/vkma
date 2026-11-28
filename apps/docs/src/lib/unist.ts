// Depth-first walks over hast and mdast trees, typed — no unist-util-visit.
import type { Comment, Doctype, Element, Root as HastRoot, Text } from "hast";
import type { Content, Parent as MdastParent } from "mdast";

type HastParent = Element | HastRoot;
type HastChild = Element | Text | Comment | Doctype;

/** Children are visited last-to-first so a visitor may replace or remove them. */
export function walkHast(
	node: HastParent,
	visit: (parent: HastParent, node: HastChild, index: number) => void,
): void {
	for (let index = node.children.length - 1; index >= 0; index--) {
		const child = node.children[index];
		if (!child) {
			continue;
		}
		visit(node, child, index);
		if (child.type === "element") {
			walkHast(child, visit);
		}
	}
}

export function walkMdast(
	node: MdastParent,
	visit: (parent: MdastParent, node: Content, index: number) => void,
): void {
	for (let index = node.children.length - 1; index >= 0; index--) {
		const child = node.children[index];
		if (!child) {
			continue;
		}
		visit(node, child, index);
		if ("children" in child) {
			walkMdast(child, visit);
		}
	}
}
