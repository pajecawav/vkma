# AGENTS.md — packages/api-schema

Generated TypeScript types, zod and valibot schemas for the VK API, produced
from the `VKCOM/vk-api-schema` git submodule with `@pajecawav/json2code`.
Keep all comments, commits, and docs in English.

## Pipeline

- `schema/` — the upstream schema as a git submodule (per-section
  `methods` / `objects` / `responses` JSON in the VK dialect). Fresh clone:
  `git submodule update --init --recursive` (CI checks out with
  `submodules: recursive`).
- `scripts/generate.ts` (`pnpm generate`) is the only producer of
  `src/generated/` and `.schema-transformed/` (both git-ignored):
    1. `scripts/lib/transform.ts` rewrites the VK dialect into plain JSON
       Schema `definitions` in `.schema-transformed/` (methods live in a
       top-level `methods[]` array json2code can't walk; `{ response: T }`
       response wrappers are unwrapped; objects pass through verbatim).
    2. json2code runs per section × three targets — `typescript` as-is,
       `zod` + `valibot` with `exportSuffix: "Schema"`.
    3. `scripts/lib/emit.ts` emits `version.ts` (`API_VERSION`),
       `enum-names.ts` (`…EnumNames` constants) and per-target barrels with
       explicit named re-exports.
- Hand-written `src/` is three one-line re-exports (`index.ts`, `zod.ts`,
  `valibot.ts`); everything else under `src/` is generated — never edit it,
  the next generate wipes it.
- Node >= 22.18: the generator runs on native TS type stripping; `engines`
  is meaningful, don't lower it silently.

## Invariants — do not break

1. **json2code is the only TS printer.** Divergences from upstream type
   expressions are transform-level decisions (documented in the
   `scripts/lib/transform.ts` header), never hand-patches in output.
2. **`rootExports: "auto"` everywhere**: the VK doc roots are pure metadata;
   exporting them yields `unknown` placeholders named after the file
   (deliberately dropped).
3. **Valibot emits via `genericAnnotations: true`** — a structural type
   alias + `v.GenericSchema` annotation keeps the generated `.d.ts` tiny
   instead of materializing `SchemaWithPipe<…>`.
4. **Fail loudly on broken schema input**: no `version` field in any
   `methods.json` aborts the generate rather than emitting a wrong
   `API_VERSION`.
5. **Versioning**: the package minor encodes the API version (`0.5199.x` ↔
   API `5.199`); `API_VERSION` comes from the schema and a test asserts it.
   Schema updates: root `pnpm update-schema` (submodule bump to upstream
   master + regen), ship via changesets, keep the minor aligned with the new
   API version.
6. **Validator imports stay confined** to `src/zod.ts` / `src/valibot.ts`
   and the generated validator barrels. Both peers (`zod` ^4, `valibot` ^1)
   are optional — types-only consumers must not pull a validator.

## Exports & naming

- Root entry: types + `MethodMap` (every documented method by its dotted
  name) plus the runtime `API_VERSION` / `…EnumNames` constants.
  `MethodSchemas` (`/zod`, `/valibot`) is the runtime counterpart of
  `MethodMap`: `params` always present, `response` only where the schema
  documents one (base variant; extended variants are their own exports;
  responses documented for methods the schema never declares are not in the
  map).
- Granular subpaths `/zod/*` and `/valibot/*` exist because the barrels
  evaluate everything in plain Node — cold-start-sensitive code imports
  section modules (`/zod/messages/methods`, extensionless).
- Naming follows `VKCOM/api-schema-typescript`: `apps.getCatalog` params →
  `AppsGetCatalogParams`, `apps_apps` → `AppsApp`; object properties keep
  the schema's snake_case; `enum` + `enumNames` also emit a `…EnumNames`
  constant.
- `src/index.test.ts` is the parity smoke test (`API_VERSION`, enum names,
  parse round-trips, `MethodMap`/`MethodSchemas` agreement) — extend it when
  adding generator features.
