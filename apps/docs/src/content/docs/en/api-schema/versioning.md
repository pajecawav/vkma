---
title: Versioning
description: "The package minor encodes the VK API version: 0.5199.x is built from API 5.199."
sidebar:
    order: 3
---

The package is versioned as `0.<API version>.<patch>`: the minor segment is the VK API version the types and schemas were generated from. `0.5199.3` is API `5.199`, the third package build on it. Current VK API versions have major `5`, so the minor reads directly: `5199` → `5.199`, `5200` → `5.200`.

## Reading the version

- `@vkma.dev/api-schema@0.5199.x` ↔ VK API `5.199` — drop the dot: `5.199` → `5199`.
- Available snapshots show up in the registry: `npm view @vkma.dev/api-schema versions --json` — every minor is its own API version.
- The minor changes only when the API version does: types and schemas may have shifted, so treat the upgrade as a minor bump.
- Patches within the same minor are regenerations and fixes of the same VK API snapshot.
- Take the request's `v` parameter from the constant instead of duplicating a string:

```ts
import { API_VERSION } from "@vkma.dev/api-schema"; // "5.199"

const url = `https://api.vk.com/method/apps.get?v=${API_VERSION}&…`;
```

When an app hardcodes `v` and it drifts from `API_VERSION`, the package's types describe a different API version than the server actually answers with.

## Updates never arrive silently

On `0.x` versions the standard ranges never cross the minor: both `^0.5199.0` and `~0.5199.0` mean `>=0.5199.0 <0.5200.0`. A new VK API version is a new minor, so `npm update` will not pull it — moving to the next snapshot is always explicit (`npm install @vkma.dev/api-schema@^0.5200.0` for API `5.200`). Patches within the minor are safe — regenerations of the same snapshot.

Assert your hardcoded version against the constant so drift fails in CI instead of surfacing as response shapes in production:

```ts
import { API_VERSION } from "@vkma.dev/api-schema";
import { expect, test } from "vitest";
import { VK_API_VERSION } from "../src/api/version"; // your constant

test("the request API version matches the package", () => {
    expect(VK_API_VERSION).toBe(API_VERSION);
});
```

## API_VERSION

The constant is generated from the schema's `methods.json` `version` field at package build time and pinned by a test. A schema without a version field aborts the generate immediately instead of silently emitting a wrong constant.

## What ships in a patch

A patch within the minor is a regeneration of the same API snapshot: clarified descriptions in the upstream schema (types and doc comments grow from them) and generator fixes. The contract of that VK API version does not change — a patch never requires app-side changes.

## Schema updates

The package is built from the [VKCOM/vk-api-schema](https://github.com/VKCOM/vk-api-schema) git submodule. The update cycle:

1. `pnpm update-schema` at the monorepo root — the submodule moves to upstream master and the packages regenerate.
2. Releases ship via changesets; the minor is realigned to the new API version (`5.199` → `5.200` means minor `5200`).
3. Generated code is never committed — it appears at build time from the submodule.

On a fresh clone of the monorepo the package sources are empty until `pnpm generate` (builds generate `src/generated`); the npm package ships the generated code prebuilt.

Types — in [types](/en/api-schema/types/), schemas — in [validators](/en/api-schema/validators/).
