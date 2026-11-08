---
title: Типы
description: "Типы из корня пакета: объекты, параметры, ответы, константы EnumNames и API_VERSION."
sidebar:
    order: 1
---

Типы и константы живут в корневом входе `@vkma.dev/api-schema` — zod и valibot для них не нужны, пира-валидатора в зависимостях не появится.

```ts
import { API_VERSION, AppsApp, AppsGetCatalogParams, MessagesMessage } from "@vkma.dev/api-schema";

const params: AppsGetCatalogParams = { count: 10 };
```

## Именование

Имена собираются по правилам [`VKCOM/api-schema-typescript`](https://github.com/VKCOM/api-schema-typescript):

| Что               | Пример                                                       |
| ----------------- | ------------------------------------------------------------ |
| Объекты           | `apps_apps` → `AppsApp`                                      |
| Параметры метода  | `apps.getCatalog` → `AppsGetCatalogParams`                   |
| Ответ             | `apps.getCatalog` → `AppsGetCatalogResponse`                 |
| Расширенный ответ | `apps.getFriendsList` → `AppsGetFriendsListExtendedResponse` |

Обёртка `{ response: T }` из VK-схемы снимается: тип — сам ответ, а не `{ response: … }`. Свойства объектов сохраняют snake_case из схемы (`first_name`, `last_name`) — трансляции в camelCase нет.

## EnumNames

Определения с `enum` + `enumNames` получают рантайм-константу с суффиксом `EnumNames` — соответствие человекочитаемого имени значению enum:

```ts
import { AdsAdApprovedEnumNames } from "@vkma.dev/api-schema";

// { NOT_MODERATED: 0, PENDING_MODERATION: 1, APPROVED: 2, REJECTED: 3 } as const
AdsAdApprovedEnumNames.APPROVED; // 2
```

## API_VERSION

```ts
import { API_VERSION } from "@vkma.dev/api-schema"; // "5.199"
```

Версия VK API, из которой собран пакет, — генерируется из схемы и закреплена тестом. Как она связана с версией пакета — в [версиях](/api-schema/versioning/).

## MethodMap

`MethodMap` типизирует каждый задокументированный метод по точечному имени: слот `params` есть всегда, `response` — только там, где VK документирует ответ (например, у `account.ban` ответа в схеме нет). Методы с несколькими вариантами ответа (extended и др.) получают union:

```ts
import type { MethodMap } from "@vkma.dev/api-schema";

// "apps.getFriendsList" → response:
//   AppsGetFriendsListExtendedResponse | AppsGetFriendsListResponse

type Call = <M extends keyof MethodMap>(
    method: M,
    params: MethodMap[M]["params"],
) => Promise<MethodMap[M]["response"]>;
```

Такая карта — основа типизированного API-клиента без кодогенерации у тебя в проекте. Ответы, задокументированные для методов, которых схема не объявляет, в карту не попадают.

Рантайм-коллега для проверок — `MethodSchemas` в [валидаторах](/api-schema/validators/).
