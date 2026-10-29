# @vkma.dev/api-schema

[![npm](https://img.shields.io/npm/v/@vkma.dev/api-schema.svg)](https://www.npmjs.com/package/@vkma.dev/api-schema)
[![minzip](https://img.shields.io/bundlephobia/minzip/@vkma.dev/api-schema.svg)](https://bundlephobia.com/package/@vkma.dev/api-schema)

Generated TypeScript types, [zod](https://zod.dev) and [valibot](https://valibot.dev) schemas for the [VK API](https://dev.vk.com/), built from [VKCOM/vk-api-schema](https://github.com/VKCOM/vk-api-schema) with [@pajecawav/json2code](https://github.com/pajecawav/json2code).

## Install

```sh
npm install @vkma.dev/api-schema
# or: pnpm add / yarn add / bun add
# optional peers, only if you use the corresponding subpath
npm install zod      # for @vkma.dev/api-schema/zod
npm install valibot  # for @vkma.dev/api-schema/valibot
```

## Usage

Types and constants from the root (no validator dependency needed):

```ts
import { API_VERSION, AppsApp, AppsGetCatalogParams, MessagesMessage } from "@vkma.dev/api-schema";

const params: AppsGetCatalogParams = { count: 10 };
```

zod schemas from `@vkma.dev/api-schema/zod` (export names carry a `Schema` suffix):

```ts
import { AppsGetCatalogParamsSchema } from "@vkma.dev/api-schema/zod";

AppsGetCatalogParamsSchema.parse({ count: 10 });
```

valibot schemas from `@vkma.dev/api-schema/valibot` (same names):

```ts
import { BaseObjectSchema } from "@vkma.dev/api-schema/valibot";

BaseObjectSchema.parse({ id: 1, title: "app" });
```

### Granular imports

The barrels export everything, and in plain Node (no tree-shaking) importing one evaluates the whole package. When cold-start time matters, import a single section module instead — specifiers are extensionless:

```ts
import { BaseObjectSchema } from "@vkma.dev/api-schema/valibot/base/objects";
import { MessagesSendParamsSchema } from "@vkma.dev/api-schema/zod/messages/methods";
```

### Method map

`MethodMap` (root) types every documented method by its dotted name; `MethodSchemas` (zod/valibot) is the runtime counterpart. `params` is always present, `response` only where the VK schema documents one; methods with several response variants (extended etc.) get a union of them.

```ts
import type { MethodMap } from "@vkma.dev/api-schema";
import { MethodSchemas } from "@vkma.dev/api-schema/zod";

type Call = <M extends keyof MethodMap>(
    method: M,
    params: MethodMap[M]["params"],
) => Promise<MethodMap[M]["response"]>;

MethodSchemas["ads.getAccounts"].params.parse({});
```

The runtime `response` slot holds the base variant (`<method>_response`); extended variants (`…_extended_response` and friends) stay available as their own exports. A handful of responses documented in the VK schema for methods it never declares are not part of the map.

Naming follows [VKCOM/api-schema-typescript](https://github.com/VKCOM/api-schema-typescript): `apps_apps` → `AppsApp`, `apps.getCatalog` params → `AppsGetCatalogParams`, responses (with the `{ response: T }` wrapper unwrapped) → `AppsGetCatalogResponse` / `AppsGetCatalogExtendedResponse`. Object properties keep the schema's snake_case. Definitions with `enum` + `enumNames` also get a `…EnumNames` constant (`AdsAdApprovedEnumNames`).

## Versioning

The minor segment encodes the VK API version: package `0.5199.x` is generated from API `5.199`. `API_VERSION` is exported from the root entry.

## License

MIT.
