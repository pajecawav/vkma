# @vkma.dev/api-schema

Generated TypeScript types, [zod](https://zod.dev) and [valibot](https://valibot.dev) schemas for the [VK API](https://dev.vk.com/), built from [VKCOM/vk-api-schema](https://github.com/VKCOM/vk-api-schema) with [@pajecawav/json2code](https://github.com/pajecawav/json2code).

The VK API schema lives in this repo as a git submodule (`schema/`); generated code is **not** committed — it is produced at build time (`pnpm build` → `generate` + `tsdown`).

## Install

```sh
pnpm add @vkma.dev/api-schema
# optional peers, only if you use the corresponding subpath
pnpm add zod      # for @vkma.dev/api-schema/zod
pnpm add valibot  # for @vkma.dev/api-schema/valibot
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

Naming follows [VKCOM/api-schema-typescript](https://github.com/VKCOM/api-schema-typescript): `apps_apps` → `AppsApp`, `apps.getCatalog` params → `AppsGetCatalogParams`, responses (with the `{ response: T }` wrapper unwrapped) → `AppsGetCatalogResponse` / `AppsGetCatalogExtendedResponse`. Object properties keep the schema's snake_case. Definitions with `enum` + `enumNames` also get a `…EnumNames` constant (`AdsAdApprovedEnumNames`).

## Versioning

The minor segment encodes the VK API version: package `0.5199.x` is generated from API `5.199`. `API_VERSION` is exported from the root entry.

## Updating the schema

```sh
git submodule update --init --recursive   # fresh clone
pnpm update-schema                        # bump submodule + regenerate
```

Schema updates land through [changesets](https://github.com/changesets/changesets); keep the package minor aligned with the new API version.
