// Minimal hast builders — enough for the Markdown plugins, no hastscript.
import type { Element, ElementContent, Properties, Text } from "hast";

export const h = (
	tagName: string,
	properties?: Properties,
	children?: ElementContent[],
): Element => ({
	type: "element",
	tagName,
	properties: properties ?? {},
	children: children ?? [],
});

export const text = (value: string): Text => ({ type: "text", value });

/** Text content of a hast node. */
export const toText = (node: ElementContent | Element): string => {
	if (node.type === "text") {
		return node.value;
	}
	if (node.type === "element") {
		return node.children.map(toText).join("");
	}
	return "";
};
