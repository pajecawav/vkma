---
title: Validators
description: "zod and valibot schemas: the Schema suffix, MethodSchemas and granular imports for cold start."
sidebar:
    order: 2
---

Schemas live in two subpaths: `@vkma.dev/api-schema/zod` and `@vkma.dev/api-schema/valibot`. Names are identical in both, carrying a `Schema` suffix.

```sh
npm install @vkma.dev/api-schema zod      # or valibot — the one you use
# or: pnpm add / yarn add / bun add
```

Both peers are optional and needed exactly when you import the corresponding subpath: zod ^4, valibot ^1. Types-only consumers importing from the root pull neither.

## Schemas

```ts
import { AppsGetCatalogParamsSchema } from "@vkma.dev/api-schema/zod";

AppsGetCatalogParamsSchema.parse({ count: 10 });
```

```ts
import { BaseObjectSchema } from "@vkma.dev/api-schema/valibot";

BaseObjectSchema.parse({ id: 1, title: "app" });
```

For trust boundaries (API responses, third-party input) prefer `safeParse`, which throws nothing and returns an issue tree:

```ts
const result = MessagesSendParamsSchema.safeParse(input);

if (!result.success) {
    // result.error — issues with paths to the invalid fields
}
```

## MethodSchemas

The runtime counterpart of `MethodMap`: the same dotted keys, with `params` and `response` slots. A natural fit for validating an API client's inputs and outputs:

```ts
import { MethodSchemas } from "@vkma.dev/api-schema/zod";

const schema = MethodSchemas["apps.getCatalog"];
schema.params.parse({ count: 10 });
schema.response.parse(await callVkApi("apps.getCatalog", { count: 10 }));
```

The rules mirror [MethodMap](/en/api-schema/types/): every method has `params`, only documented ones have `response`. The runtime `response` slot holds the base variant (`<method>_response`); extended variants (`…_extended_response` and friends) stay available as their own named exports. Slots are declared as `z.ZodType<…>` / `v.GenericSchema<…>`. `Parse`/`safeParse` calls work the same in both subpaths.

## Granular imports

The `/zod` and `/valibot` barrels re-export everything, and in plain Node (no tree-shaking) a single import from a barrel evaluates the whole package, thousands of schemas. When cold-start time matters (serverless, CLIs), import a section module directly:

```ts
import { BaseObjectSchema } from "@vkma.dev/api-schema/valibot/base/objects";
import { MessagesSendParamsSchema } from "@vkma.dev/api-schema/zod/messages/methods";
```

Specifiers are extensionless. A section is a VK API domain, about sixty of them: `account`, `ads`, `apps`, `base`, `messages`, `users`, `wall`, `widgets`, …; the file is `methods`, `objects` or `responses`.

## zod or valibot

Names, structure and granular paths are identical. Pick by the validator already in your project and import from its subpath. The API version the schemas were built for is in [versioning](/en/api-schema/versioning/).
