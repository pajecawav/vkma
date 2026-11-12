---
title: Types
description: "Types from the package root: objects, params, responses, EnumNames constants and API_VERSION."
sidebar:
    order: 1
---

Types and constants live in the root entry `@vkma.dev/api-schema`. No zod or valibot is needed for them, and no validator peer appears in your dependencies.

```ts
import { API_VERSION, AppsApp, AppsGetCatalogParams, MessagesMessage } from "@vkma.dev/api-schema";

const params: AppsGetCatalogParams = { count: 10 };
```

## Naming

Names follow the rules of [`VKCOM/api-schema-typescript`](https://github.com/VKCOM/api-schema-typescript):

| What              | Example                                                      |
| ----------------- | ------------------------------------------------------------ |
| Objects           | `apps_apps` → `AppsApp`                                      |
| Method params     | `apps.getCatalog` → `AppsGetCatalogParams`                   |
| Response          | `apps.getCatalog` → `AppsGetCatalogResponse`                 |
| Extended response | `apps.getFriendsList` → `AppsGetFriendsListExtendedResponse` |

The `{ response: T }` wrapper from the VK schema is unwrapped: the type is the response itself, not `{ response: … }`. Object properties keep the schema's snake_case (`first_name`, `last_name`). There is no camelCase translation.

## EnumNames

Definitions with `enum` + `enumNames` also get a runtime constant with an `EnumNames` suffix, a mapping from the human-readable name to the enum value:

```ts
import { AdsAdApprovedEnumNames } from "@vkma.dev/api-schema";

// { NOT_MODERATED: 0, PENDING_MODERATION: 1, APPROVED: 2, REJECTED: 3 } as const
AdsAdApprovedEnumNames.APPROVED; // 2
```

## API_VERSION

```ts
import { API_VERSION } from "@vkma.dev/api-schema"; // "5.199"
```

The constant carries the VK API version the package was generated from. It is produced from the schema and pinned by a test. How it relates to the package version is in [versioning](/en/api-schema/versioning/).

## MethodMap

`MethodMap` types every documented method by its dotted name: the `params` slot is always present, `response` only where VK documents one (`account.ban`, for example, has no documented response). Methods with several response variants (extended and friends) get a union:

```ts
import type { MethodMap } from "@vkma.dev/api-schema";

// "apps.getFriendsList" → response:
//   AppsGetFriendsListExtendedResponse | AppsGetFriendsListResponse

type Call = <M extends keyof MethodMap>(
    method: M,
    params: MethodMap[M]["params"],
) => Promise<MethodMap[M]["response"]>;
```

That map is the backbone of a typed API client without codegen in your project. Responses documented for methods the schema never declares are not part of the map.

Its runtime counterpart for validation is `MethodSchemas`, see [validators](/en/api-schema/validators/).
