/**
 * Transforms the VK API schema dialect into plain JSON Schema documents
 * that stock json2code understands.
 *
 * - per-section `methods` docs: VK keeps methods in a top-level `methods[]`
 *   array with a `parameters[]` list; json2code only walks `definitions`.
 *   Each method becomes a `<section>_<method>_params` object definition.
 * - per-section `responses` docs: most response definitions are a
 *   single-property `{ response: T }` wrapper; it is unwrapped so the
 *   exported type is the payload itself (parity with
 *   VKCOM/api-schema-typescript).
 * - per-section `objects` docs: passed through verbatim (already standard
 *   `definitions`).
 */

export interface EnumNamesEntry {
	/** Schema definition name (`ads_ad_approved`). */
	readonly defName: string;
	/** Enum values, in order. */
	readonly values: readonly (string | number)[];
	/** Human-readable enum names, in order. */
	readonly names: readonly string[];
}

/** Shape of a VK API schema JSON document (per-section methods/objects/responses). */
export interface VkSchemaDocument {
	readonly $schema?: unknown;
	readonly title?: unknown;
	readonly description?: unknown;
	readonly version?: unknown;
	readonly methods?: unknown;
	readonly definitions?: unknown;
}

interface VkParameter {
	readonly name?: unknown;
	readonly [key: string]: unknown;
}

interface VkMethod {
	readonly name?: unknown;
	readonly description?: unknown;
	readonly parameters?: unknown;
}

export function transformMethodsDoc(raw: VkSchemaDocument): {
	doc: VkSchemaDocument;
	version?: string;
} {
	const version = typeof raw.version === "string" ? raw.version : undefined;
	const methods = Array.isArray(raw.methods) ? (raw.methods as VkMethod[]) : [];
	const definitions: Record<string, unknown> = {};

	for (const method of methods) {
		if (typeof method?.name !== "string") {
			continue;
		}
		const parameters = Array.isArray(method.parameters)
			? (method.parameters as VkParameter[])
			: [];
		const properties: Record<string, unknown> = {};
		for (const param of parameters) {
			if (typeof param?.name !== "string") {
				continue;
			}
			const { name: _name, ...schema } = param;
			properties[param.name] = schema;
		}
		definitions[`${method.name.replaceAll(".", "_")}_params`] = {
			type: "object",
			description: typeof method.description === "string" ? method.description : undefined,
			properties,
		};
	}

	return {
		doc: {
			$schema: raw.$schema,
			title: raw.title,
			description: raw.description,
			definitions,
		},
		version,
	};
}

export function transformResponsesDoc(raw: VkSchemaDocument): VkSchemaDocument {
	const source = (raw.definitions ?? {}) as Record<string, unknown>;
	const definitions: Record<string, unknown> = {};

	for (const [name, def] of Object.entries(source)) {
		definitions[name] = unwrapResponse(def);
	}

	return {
		$schema: raw.$schema,
		title: raw.title,
		description: raw.description,
		definitions,
	};
}

/** Replace a `{ response: T }` single-property wrapper with the inner schema. */
function unwrapResponse(def: unknown): unknown {
	if (!isRecord(def) || !isRecord(def["properties"])) {
		return def;
	}
	const props = def["properties"];
	const keys = Object.keys(props);
	if (keys.length !== 1 || keys[0] !== "response") {
		return def;
	}
	const inner = props["response"];
	if (!isRecord(inner)) {
		return def;
	}
	return { description: def["description"], ...inner };
}

/**
 * Collect a top-level `enum` + `enumNames` (or legacy `enum_names`) pair
 * from a definition, for `…EnumNames` constant generation.
 */
export function collectEnumNames(defName: string, schema: unknown): EnumNamesEntry | null {
	if (!isRecord(schema)) {
		return null;
	}
	const values = schema["enum"];
	const names = schema["enumNames"] ?? schema["enum_names"];
	if (!Array.isArray(values) || !Array.isArray(names) || names.length !== values.length) {
		return null;
	}
	return { defName, values, names: names.map(String) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
