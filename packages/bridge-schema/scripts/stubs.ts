/**
 * Computes the per-method payload stubs emitted into
 * `src/generated/catalogue-data.ts`: for every entry of
 * `x-vkma-catalogue.props` a minimal JSON object carrying the method's
 * REQUIRED props, each filled with the simplest value of its schema type.
 *
 * Deliberately shallow and conservative — this feeds the devtools execute
 * panel's params prefill, not a validator:
 * - `enum` → first entry, scalars → `""` / `0` / `false`, arrays → `[]`;
 * - nested objects expand their required keys, depth-capped at `MAX_DEPTH`;
 * - `anyOf` / `oneOf` / `allOf` take the first branch that yields anything;
 * - `$ref` resolves through `$defs` with a path-scoped cycle guard;
 * - anything underivable is omitted, and a method with no required keys
 *   still yields `{}` — prefilling `{}` beats an empty textarea.
 *
 * The walker runs at generation time only; the shipped package stays
 * pure data.
 */

interface SchemaNode {
	readonly $ref?: unknown;
	readonly type?: unknown;
	readonly enum?: unknown;
	readonly properties?: unknown;
	readonly required?: unknown;
	readonly anyOf?: unknown;
	readonly oneOf?: unknown;
	readonly allOf?: unknown;
}

/** How many levels of nested objects expand their required keys. */
const MAX_DEPTH = 2;
const REF_PREFIX = "#/$defs/";

export interface CatalogueDoc {
	readonly $defs: Readonly<Record<string, unknown>>;
	readonly "x-vkma-catalogue": {
		readonly props: Readonly<Record<string, string>>;
	};
}

export function computeStubs(doc: CatalogueDoc): Record<string, Record<string, unknown>> {
	const { $defs } = doc;
	const stubs: Record<string, Record<string, unknown>> = {};
	for (const [method, defName] of Object.entries(doc["x-vkma-catalogue"].props)) {
		const stub = objectStub($defs[defName], 0, $defs, new Set([defName]));
		// Every props definition is an object shape, so this is always at least `{}`.
		if (stub !== undefined) {
			stubs[method] = stub;
		}
	}
	return stubs;
}

/** The object stub of a schema node, or `undefined` when none is derivable. */
function objectStub(
	node: unknown,
	depth: number,
	defs: Readonly<Record<string, unknown>>,
	seen: ReadonlySet<string>,
): Record<string, unknown> | undefined {
	const resolved = resolveNode(node, defs, seen);
	if (resolved === undefined) {
		return undefined;
	}
	if (resolved["type"] === "object") {
		const stub: Record<string, unknown> = {};
		if (depth < MAX_DEPTH) {
			const properties = asRecord(resolved["properties"]);
			for (const key of asStrings(resolved["required"])) {
				const value = valueStub(properties[key], depth + 1, defs, seen);
				if (value !== undefined) {
					stub[key] = value;
				}
			}
		}
		return stub;
	}
	// Wrapper keywords around an object shape (e.g. WallPostRequestOptions).
	for (const branch of [
		...asNodes(resolved["anyOf"]),
		...asNodes(resolved["oneOf"]),
		...asNodes(resolved["allOf"]),
	]) {
		const stub = objectStub(branch, depth, defs, seen);
		if (stub !== undefined) {
			return stub;
		}
	}
	return undefined;
}

/** The simplest value of a property schema, or `undefined` to omit the key. */
function valueStub(
	node: unknown,
	depth: number,
	defs: Readonly<Record<string, unknown>>,
	seen: ReadonlySet<string>,
): unknown {
	const resolved = resolveNode(node, defs, seen);
	if (resolved === undefined) {
		return undefined;
	}
	if (Array.isArray(resolved["enum"])) {
		return resolved["enum"][0];
	}
	switch (resolved["type"]) {
		case "string":
			return "";
		case "integer":
		case "number":
			return 0;
		case "boolean":
			return false;
		case "array":
			return [];
		case "object":
			return depth <= MAX_DEPTH ? objectStub(resolved, depth, defs, seen) : undefined;
	}
	// unions: the first branch that yields a value
	for (const branch of [...asNodes(resolved["anyOf"]), ...asNodes(resolved["oneOf"])]) {
		const value = valueStub(branch, depth, defs, seen);
		if (value !== undefined) {
			return value;
		}
	}
	return undefined;
}

/** `$ref` → the referenced definition, with a path-scoped cycle guard. */
function resolveNode(
	node: unknown,
	defs: Readonly<Record<string, unknown>>,
	seen: ReadonlySet<string>,
): SchemaNode | undefined {
	if (!isRecord(node)) {
		return undefined;
	}
	const ref = node["$ref"];
	if (typeof ref !== "string" || !ref.startsWith(REF_PREFIX)) {
		return node;
	}
	const name = ref.slice(REF_PREFIX.length);
	if (!(name in defs) || seen.has(name)) {
		return undefined;
	}
	// The guard is path-scoped: a copy per resolution, so sibling branches
	// may reference the same definition without shadowing each other.
	return resolveNode(defs[name], defs, new Set(seen).add(name));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function asStrings(value: unknown): readonly string[] {
	return Array.isArray(value) ? (value as readonly string[]) : [];
}

function asNodes(value: unknown): readonly SchemaNode[] {
	return Array.isArray(value) ? (value as readonly SchemaNode[]) : [];
}
