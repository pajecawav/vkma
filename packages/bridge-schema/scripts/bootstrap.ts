/**
 * Bootstrap — the one-time (but re-runnable) conversion of
 * @vkontakte/vk-bridge's `src/types/data.ts` into `schema/events.json`.
 *
 * Run `pnpm bootstrap`; afterwards the checked-in JSON is the source of truth
 * (hand-maintained) and `pnpm generate` turns it into the published types.
 * Re-running this only makes sense when deliberately syncing with a new
 * upstream release: bump the reference devDependency in the catalog, run the
 * bootstrap, review the `schema/events.json` diff, re-run the tests.
 *
 * How it walks the types: the TypeScript 7 unstable sync API (a spawned
 * tsgo) resolves generic instantiations, `keyof`, indexed access, `Omit` and
 * the `ElementSetType` conditionals; this file translates the RESOLVED types
 * into the JSON Schema subset json2code understands ($ref / const / enum /
 * anyOf / allOf / properties / required / additionalProperties / items).
 *
 * Posture towards upstream (MIT): no code is copied — only interface facts
 * (event names, payload shapes) travel, which is the whole point of the
 * catalogue. Divergences from upstream's exact type expressions:
 *
 * - intersections of object constituents are MERGED (or `allOf` for named
 *   refs) and `A & (B | C)` is distributed into a union — semantically
 *   equivalent, syntactically different;
 * - `any` renders as `unknown` (json2code has no `any`);
 * - the non-primitive `object` keyword renders as `{}` (caller-compatible,
 *   not mutually assignable with upstream);
 * - generic helper aliases (`VKPayProps`, `ElementSetType`) cannot be
 *   expressed in plain JSON Schema: map entries that use them get precise
 *   synthesized per-event definitions, while the standalone generic export
 *   itself degrades to `unknown`.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SyntaxKind, isTypeAliasDeclaration } from "typescript/unstable/ast";
import type {
	PropertySignatureDeclaration,
	TypeAliasDeclaration,
	TypeReferenceNode,
} from "typescript/unstable/ast";
import { API, SymbolFlags, TypeFlags } from "typescript/unstable/sync";
import type { Checker, Project, Symbol, Type, UnionType } from "typescript/unstable/sync";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bootstrapDir = path.join(pkgRoot, ".bootstrap");
const schemaFile = path.join(pkgRoot, "schema", "events.json");

interface UpstreamPackageJson {
	readonly name: string;
	readonly version: string;
}
async function main(): Promise<void> {
	const require = createRequire(import.meta.url);
	const upstreamPackageJsonPath = require.resolve("@vkontakte/vk-bridge/package.json");
	const upstreamRoot = path.dirname(upstreamPackageJsonPath);
	const upstream = JSON.parse(
		await readFile(upstreamPackageJsonPath, "utf8"),
	) as UpstreamPackageJson;
	const dataPath = path.join(upstreamRoot, "src", "types", "data.ts");
	console.log(
		`bootstrap: extracting from ${path.relative(pkgRoot, dataPath)} (v${upstream.version})`,
	);

	// A minimal project that pulls only the catalogue files into the program
	// (values.ts joins via data.ts's relative import).
	const tsconfig = {
		compilerOptions: {
			strict: true,
			noEmit: true,
			target: "es2022",
			module: "esnext",
			moduleResolution: "bundler",
			allowImportingTsExtensions: true,
			skipLibCheck: true,
		},
		files: [dataPath],
	};
	await rm(bootstrapDir, { recursive: true, force: true });
	await mkdir(bootstrapDir, { recursive: true });
	const tsconfigPath = path.join(bootstrapDir, "tsconfig.json");
	await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, "\t")}\n`);

	const api = new API({ cwd: pkgRoot });
	try {
		const snapshot = api.updateSnapshot({ openProjects: [tsconfigPath] });
		const project = snapshot.getProject(tsconfigPath);
		if (!project) {
			throw new Error("bootstrap: the extraction project did not open");
		}
		const { defs, catalogue } = new CatalogueExtractor(project, dataPath).extract();

		const doc = {
			$schema: "https://json-schema.org/draft/2020-12/schema",
			title: "VK Bridge event catalogue",
			description:
				"Payload types ($defs) and method wiring (x-vkma-catalogue) of every VK Bridge event. Facts only — event names and payload shapes of the platform interface.",
			$defs: Object.fromEntries(
				[...defs.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
			),
			"x-vkma-catalogue": catalogue,
		};
		await mkdir(path.dirname(schemaFile), { recursive: true });
		await writeFile(schemaFile, `${JSON.stringify(doc, null, "\t")}\n`);

		const props = Object.keys(catalogue.props).length;
		const receive = Object.keys(catalogue.receive).length;
		const events = Object.keys(catalogue.events).length;
		console.log(
			`bootstrap: wrote ${path.relative(pkgRoot, schemaFile)} — methods: ${props}, receive: ${receive}, wiring: ${events}, defs: ${defs.size}, reference: v${upstream.version}`,
		);
	} finally {
		api.close();
		await rm(bootstrapDir, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// The extractor
// ---------------------------------------------------------------------------

/** JSON Schema node subset we emit (input vocabulary of json2code). */
type SchemaNode = true | { readonly [keyword: string]: unknown };

interface WiringEntry {
	readonly result: string;
	readonly failed: string;
}
interface EventsCatalogue {
	readonly props: Readonly<Record<string, string>>;
	readonly receive: Readonly<Record<string, string>>;
	readonly events: Readonly<Record<string, WiringEntry>>;
}

/** `true` (the empty schema) renders as `unknown` in json2code. */
const ANY: SchemaNode = true;

const MAP_NAMES = {
	props: "RequestPropsMap",
	receive: "ReceiveDataMap",
	events: "ReceiveEventMap",
} as const;

/** Cap for distributing intersections over unions (defensive; upstream stays far below). */
const DISTRIBUTION_CAP = 64;

class CatalogueExtractor {
	private readonly checker: Checker;
	private readonly project: Project;
	private readonly dataPath: string;
	private readonly aliases = new Map<string, TypeAliasDeclaration>();
	private readonly defs = new Map<string, SchemaNode>();
	private readonly done = new Set<string>();

	public constructor(project: Project, dataPath: string) {
		this.project = project;
		this.checker = project.checker;
		this.dataPath = dataPath;
	}

	/** Entry point: extract the payload definitions and the wiring tables. */
	public extract(): { defs: ReadonlyMap<string, SchemaNode>; catalogue: EventsCatalogue } {
		this.registerAliases();
		this.processExportedAliases();
		const catalogue = this.extractCatalogue();
		return { defs: this.defs, catalogue };
	}

	// ---------------------------------------------------------------- setup

	private registerAliases(): void {
		const sourceFile = this.project.program.getSourceFile(this.dataPath);
		if (!sourceFile) {
			throw new Error(`extract: ${this.dataPath} is not part of the program`);
		}
		for (const statement of sourceFile.statements) {
			if (isTypeAliasDeclaration(statement)) {
				this.aliases.set(nodeName(statement), statement);
			}
		}
	}

	/** Every exported alias becomes a definition — the drop-in export surface.
	 * The three catalogue maps are excluded: they are emitted as the
	 * augmentation-able interfaces of the package root, not as payload types. */
	private processExportedAliases(): void {
		for (const [name, decl] of this.aliases) {
			if (isExported(decl) && !isMapName(name)) {
				this.ensureDef(name);
			}
		}
	}

	// ------------------------------------------------------------- catalogue

	private extractCatalogue(): EventsCatalogue {
		const props = this.mapEntryDefs(MAP_NAMES.props, "Props");
		const receive = this.mapEntryDefs(MAP_NAMES.receive, "Data");
		const events = this.extractWiring();
		return { props, receive, events };
	}

	/** Resolve a map (RequestPropsMap / ReceiveDataMap) into `event → def name`. */
	private mapEntryDefs(mapAlias: string, suffix: "Props" | "Data"): Record<string, string> {
		const mapType = this.aliasType(mapAlias);
		const entries: Record<string, string> = {};
		for (const prop of this.checker.getPropertiesOfType(mapType)) {
			entries[prop.name] = this.defForMapEntry(prop, suffix);
		}
		return sortRecord(entries);
	}

	/**
	 * A map entry either references a named upstream alias (reuse its def) or
	 * is an inline/generic shape (synthesize `<Event><Suffix>`).
	 */
	private defForMapEntry(prop: Symbol, suffix: "Props" | "Data"): string {
		const typeNodeRef = this.propertyTypeNodeRef(prop);
		if (typeNodeRef !== undefined) {
			this.ensureDef(typeNodeRef);
			return typeNodeRef;
		}
		const type = this.typeOf(prop);
		const ref = this.aliasRef(type);
		if (ref !== undefined) {
			this.ensureDef(ref);
			return ref;
		}
		const name = `${prop.name}${suffix}`;
		if (this.defs.has(name) || this.aliases.has(name)) {
			throw new Error(`extract: synthesized def name ${name} collides with an upstream name`);
		}
		this.defs.set(name, this.withDoc(this.typeToSchema(type), this.doc(prop)));
		this.done.add(name);
		return name;
	}

	/** ReceiveEventMap wiring: `method → { result, failed }` literal event names. */
	private extractWiring(): Record<string, WiringEntry> {
		const mapType = this.aliasType(MAP_NAMES.events);
		const entries: Record<string, WiringEntry> = {};
		for (const prop of this.checker.getPropertiesOfType(mapType)) {
			const wiringType = this.typeOf(prop);
			const result = this.wiringLiteral(wiringType, "result", prop.name);
			const failed = this.wiringLiteral(wiringType, "failed", prop.name);
			entries[prop.name] = { result, failed };
		}
		return sortRecord(entries);
	}

	private wiringLiteral(wiringType: Type, key: "result" | "failed", method: string): string {
		const prop = this.checker.getPropertiesOfType(wiringType).find(p => p.name === key);
		if (!prop) {
			throw new Error(`extract: wiring for ${method} has no "${key}" literal`);
		}
		const literal = this.typeOf(prop);
		if (!literal.isStringLiteralType()) {
			throw new Error(`extract: wiring ${method}.${key} is not a string literal`);
		}
		return literal.value;
	}

	// --------------------------------------------------------------- walking

	/** Resolve an alias declaration to its type. */
	private aliasType(name: string): Type {
		const decl = this.aliases.get(name);
		if (!decl) {
			throw new Error(`extract: alias ${name} not found in data.ts`);
		}
		const type = this.checker.getTypeAtLocation(decl.name);
		if (!type) {
			throw new Error(`extract: no type for alias ${name}`);
		}
		return type;
	}

	/**
	 * Emit a `$ref` when the type is a non-generic alias declared in data.ts —
	 * unless it is the alias currently being expanded (`skipAlias`).
	 */
	private aliasRef(type: Type, skipAlias?: string): string | undefined {
		const aliasSymbol = type.getAliasSymbol();
		if (!aliasSymbol) {
			return undefined;
		}
		if (type.getAliasTypeArguments().length > 0) {
			return undefined;
		}
		const [handle] = aliasSymbol.declarations;
		if (!handle || handle.path !== this.dataPath) {
			return undefined;
		}
		const name = aliasSymbol.name;
		return name === skipAlias ? undefined : name;
	}

	private typeOf(prop: Symbol): Type {
		const type = this.checker.getTypeOfSymbol(prop);
		if (!type) {
			throw new Error(`extract: no type for symbol ${prop.name}`);
		}
		return type;
	}

	private typeToSchema(type: Type, skipAlias?: string): SchemaNode {
		const ref = this.aliasRef(type, skipAlias);
		if (ref !== undefined) {
			this.ensureDef(ref);
			return { $ref: `#/$defs/${ref}` };
		}
		if (type.isStringLiteralType()) {
			return { const: type.value };
		}
		if (type.isNumberLiteralType()) {
			return { const: type.value };
		}
		if (type.isBooleanLiteralType()) {
			return { const: type.value };
		}
		if (type.isUnionType()) {
			return this.unionToSchema(type, skipAlias);
		}
		if (type.isIntersectionType()) {
			return this.intersectionToSchema(type, skipAlias);
		}
		const flags = type.flags;
		if (flags & TypeFlags.String) {
			return { type: "string" };
		}
		if (flags & TypeFlags.Number) {
			return { type: "number" };
		}
		if (flags & TypeFlags.Boolean) {
			return { type: "boolean" };
		}
		if (flags & TypeFlags.Null) {
			return { type: "null" };
		}
		if (flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Never | TypeFlags.Void)) {
			return ANY;
		}
		if (type.isTupleType()) {
			throw new Error("extract: tuple types are not implemented — add prefixItems support");
		}
		if (this.checker.isArrayType(type) && type.isTypeReference()) {
			const [element] = this.checker.getTypeArguments(type);
			if (!element) {
				return { type: "array" };
			}
			return { type: "array", items: this.typeToSchema(element, skipAlias) };
		}
		if (type.isIntrinsicType() && type.intrinsicName === "object") {
			// The non-primitive `object` keyword: renders as `{}` — caller
			// compatible, not mutually assignable with upstream. Tracked in
			// the file header comment.
			return { type: "object" };
		}
		if (type.isObjectType()) {
			return this.mergeObjects([type], skipAlias) ?? { type: "object" };
		}
		throw new Error(
			`extract: unhandled type (flags ${type.flags}, intrinsic ${
				type.isIntrinsicType() ? type.intrinsicName : "none"
			})`,
		);
	}

	private unionToSchema(union: UnionType, skipAlias?: string): SchemaNode {
		const members = union.getTypes().filter(t => (t.flags & TypeFlags.Undefined) === 0);
		if (members.length === 0) {
			return ANY;
		}
		if (members.every(t => t.isStringLiteralType())) {
			return { enum: members.map(t => t.value) };
		}
		if (members.every(t => t.isNumberLiteralType())) {
			return { enum: members.map(t => t.value) };
		}
		if (members.every(t => t.isBooleanLiteralType())) {
			return { type: "boolean" };
		}
		// Primitive subsumption: `'ru' | 'en' | string` collapses to `string`
		// (the literal members are assignable to the primitive).
		if (members.every(t => t.isStringLiteralType() || (t.flags & TypeFlags.String) !== 0)) {
			return { type: "string" };
		}
		if (members.every(t => t.isNumberLiteralType() || (t.flags & TypeFlags.Number) !== 0)) {
			return { type: "number" };
		}
		if (members.every(t => t.isBooleanLiteralType() || (t.flags & TypeFlags.Boolean) !== 0)) {
			return { type: "boolean" };
		}
		const variants = dedupeSchemas(members.map(t => this.typeToSchema(t, skipAlias)));
		return variants.length === 1 ? (variants[0] ?? ANY) : { anyOf: variants };
	}

	private intersectionToSchema(intersection: Type, skipAlias?: string): SchemaNode {
		const constituents = intersection.isIntersectionType() ? intersection.getTypes() : [];
		const unionConstituent = constituents.find(t => t.isUnionType());
		if (unionConstituent?.isUnionType()) {
			return this.distribute(constituents, unionConstituent, skipAlias);
		}
		return this.intersectionFromConstituents(constituents, skipAlias);
	}

	private intersectionFromConstituents(
		constituents: readonly Type[],
		skipAlias?: string,
	): SchemaNode {
		const refs: string[] = [];
		const objects: Type[] = [];
		for (const constituent of constituents) {
			const ref = this.aliasRef(constituent, skipAlias);
			if (ref !== undefined) {
				this.ensureDef(ref);
				refs.push(ref);
				continue;
			}
			if (constituent.isObjectType()) {
				objects.push(constituent);
				continue;
			}
			throw new Error(
				`extract: unsupported intersection constituent (flags ${constituent.flags})`,
			);
		}
		const merged = this.mergeObjects(objects, skipAlias);
		if (refs.length === 0) {
			return merged ?? { type: "object" };
		}
		const refSchemas = refs.map(name => ({ $ref: `#/$defs/${name}` }));
		if (merged === undefined) {
			return refSchemas.length === 1 ? (refSchemas[0] as SchemaNode) : { allOf: refSchemas };
		}
		return { allOf: [...refSchemas, merged] };
	}

	/** `A & (B | C)` → `(A & B) | (A & C)` — the checker usually distributes already. */
	private distribute(
		constituents: readonly Type[],
		union: UnionType,
		skipAlias?: string,
	): SchemaNode {
		const rest = constituents.filter(t => t !== union);
		const variants: SchemaNode[] = [];
		for (const member of union.getTypes().slice(0, DISTRIBUTION_CAP)) {
			variants.push(this.intersectionFromConstituents([...rest, member], skipAlias));
		}
		const unique = dedupeSchemas(variants);
		return unique.length === 1 ? (unique[0] ?? ANY) : { anyOf: unique };
	}

	/**
	 * Merge object constituents into one schema: a property is required when
	 * required in ANY constituent (intersection semantics), optional otherwise.
	 */
	private mergeObjects(
		objects: readonly Type[],
		skipAlias?: string,
	): { readonly [keyword: string]: unknown } | undefined {
		if (objects.length === 0) {
			return undefined;
		}
		const properties = new Map<string, { schema: SchemaNode; required: boolean }>();
		let additionalProperties: SchemaNode | undefined;
		for (const object of objects) {
			for (const prop of this.checker.getPropertiesOfType(object)) {
				const required = (prop.flags & SymbolFlags.Optional) === 0;
				const existing = properties.get(prop.name);
				properties.set(prop.name, {
					schema: existing?.schema ?? this.propertySchema(prop, skipAlias),
					required: (existing?.required ?? false) || required,
				});
			}
			if (additionalProperties === undefined) {
				const indexInfo = this.checker
					.getIndexInfosOfType(object)
					.find(info => (info.keyType.flags & TypeFlags.String) !== 0);
				if (indexInfo) {
					additionalProperties = this.typeToSchema(indexInfo.valueType, skipAlias);
				}
			}
		}
		if (properties.size === 0 && additionalProperties === undefined) {
			return { type: "object" };
		}
		const schema: Record<string, unknown> = { type: "object" };
		if (properties.size > 0) {
			schema["properties"] = sortRecord(
				Object.fromEntries(
					[...properties.entries()].map(([key, entry]) => [key, entry.schema]),
				),
			);
			schema["required"] = [...properties.entries()]
				.filter(([, entry]) => entry.required)
				.map(([name]) => name)
				.toSorted();
		}
		if (additionalProperties !== undefined) {
			schema["additionalProperties"] = additionalProperties;
		}
		return schema;
	}

	// ----------------------------------------------------------- properties

	/** A property's schema: direct named refs win, then the resolved type. */
	private propertySchema(prop: Symbol, skipAlias?: string): SchemaNode {
		const typeNodeRef = this.propertyTypeNodeRef(prop);
		if (typeNodeRef !== undefined) {
			this.ensureDef(typeNodeRef);
			return { $ref: `#/$defs/${typeNodeRef}` };
		}
		return this.withDoc(this.typeToSchema(this.typeOf(prop), skipAlias), this.doc(prop));
	}

	/**
	 * The property's syntactic type node referencing a data.ts alias without
	 * type arguments — preserves upstream's exact names (`EGetLaunchParams…`,
	 * `Omit` aliases) at every reference site.
	 */
	private propertyTypeNodeRef(prop: Symbol): string | undefined {
		const [handle] = prop.declarations;
		const node = handle?.resolve(this.project);
		if (!node) {
			return undefined;
		}
		const typeNode = (node as PropertySignatureDeclaration).type;
		if (!typeNode || typeNode.kind !== SyntaxKind.TypeReference) {
			return undefined;
		}
		const reference = typeNode as TypeReferenceNode;
		if (reference.typeArguments !== undefined) {
			return undefined;
		}
		if (reference.typeName.kind !== SyntaxKind.Identifier) {
			return undefined;
		}
		const name = reference.typeName.text;
		return this.aliases.has(name) ? name : undefined;
	}

	// ------------------------------------------------------------ utilities

	/** Definitions for aliases referenced via $ref — recursion is synchronous
	 * (the alias graph is finite), so no queue is needed. */
	private ensureDef(name: string): void {
		if (this.done.has(name)) {
			return;
		}
		this.done.add(name);
		const decl = this.aliases.get(name);
		if (!decl) {
			throw new Error(`extract: $ref to unknown alias ${name}`);
		}
		// Generic aliases cannot be expressed in plain JSON Schema — degrade.
		if (decl.typeParameters && decl.typeParameters.length > 0) {
			this.defs.set(name, ANY);
			return;
		}
		const type = this.checker.getTypeAtLocation(decl.name);
		if (!type) {
			throw new Error(`extract: no type for alias ${name}`);
		}
		this.defs.set(name, this.withDoc(this.typeToSchema(type, name), this.docOfNode(decl)));
	}

	private withDoc(schema: SchemaNode, description: string | undefined): SchemaNode {
		if (schema === true || description === undefined || description === "") {
			return schema;
		}
		return { ...schema, description };
	}

	private doc(prop: Symbol): string | undefined {
		const comment = prop.getDocumentationComment(this.checker);
		return comment === "" ? undefined : comment;
	}

	private docOfNode(decl: TypeAliasDeclaration): string | undefined {
		const symbol = this.checker.getSymbolAtLocation(decl.name);
		if (!symbol) {
			return undefined;
		}
		return this.doc(symbol);
	}
}

// ----------------------------------------------------------------- helpers

function nodeName(node: TypeAliasDeclaration): string {
	return node.name.text;
}

function isMapName(name: string): boolean {
	return name === MAP_NAMES.props || name === MAP_NAMES.receive || name === MAP_NAMES.events;
}

function isExported(decl: TypeAliasDeclaration): boolean {
	return (decl.modifiers ?? []).some(m => m.kind === SyntaxKind.ExportKeyword);
}

function dedupeSchemas(variants: readonly SchemaNode[]): SchemaNode[] {
	const seen = new Set<string>();
	const result: SchemaNode[] = [];
	for (const variant of variants) {
		const key = JSON.stringify(variant);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(variant);
	}
	return result;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
	return Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b)));
}

await main();
