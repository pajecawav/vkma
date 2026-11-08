---
title: api-schema
description: Типы и zod/valibot-схемы всего VK API, генерированные из официальной схемы.
sidebar:
    order: 0
    label: "Описание"
---

`@vkma.dev/api-schema` — генерированные типы TypeScript и схемы [zod](https://zod.dev) / [valibot](https://valibot.dev) для [VK API](https://dev.vk.com/), собранные из [VKCOM/vk-api-schema](https://github.com/VKCOM/vk-api-schema).

```sh
npm install @vkma.dev/api-schema
# опциональные пиры, только если используешь соответствующий subpath
npm install zod      # для @vkma.dev/api-schema/zod
npm install valibot  # для @vkma.dev/api-schema/valibot
```

## Использование

Типы и константы — из корня (валидаторы не нужны):

```ts
import { API_VERSION, AppsApp, AppsGetCatalogParams, MessagesMessage } from "@vkma.dev/api-schema";

const params: AppsGetCatalogParams = { count: 10 };
```

zod-схемы из `@vkma.dev/api-schema/zod` (имена несут суффикс `Schema`):

```ts
import { AppsGetCatalogParamsSchema } from "@vkma.dev/api-schema/zod";

AppsGetCatalogParamsSchema.parse({ count: 10 });
```

valibot-схемы из `@vkma.dev/api-schema/valibot` (те же имена):

```ts
import { BaseObjectSchema } from "@vkma.dev/api-schema/valibot";

BaseObjectSchema.parse({ id: 1, title: "app" });
```

## Гранулярные импорты

Баррели экспортируют всё, и в обычном Node (без tree-shaking) импорт одного имени вычисляет весь пакет. Когда важен cold-start, импортируй секционный модуль; спецификаторы без расширений:

```ts
import { BaseObjectSchema } from "@vkma.dev/api-schema/valibot/base/objects";
import { MessagesSendParamsSchema } from "@vkma.dev/api-schema/zod/messages/methods";
```

## Карта методов

`MethodMap` (корень) типизирует каждый задокументированный метод по его точечному имени; `MethodSchemas` (zod/valibot) — рантайм-коллега. `params` есть всегда, `response` — только там, где VK-схема его документирует; методы с несколькими вариантами ответа (extended и др.) получают union.

```ts
import type { MethodMap } from "@vkma.dev/api-schema";
import { MethodSchemas } from "@vkma.dev/api-schema/zod";

type Call = <M extends keyof MethodMap>(
    method: M,
    params: MethodMap[M]["params"],
) => Promise<MethodMap[M]["response"]>;

MethodSchemas["ads.getAccounts"].params.parse({});
```

Рантайм-слот `response` держит базовый вариант (`<method>_response`); extended-варианты (`…_extended_response` и прочие) доступны как отдельные экспорты.

## Версии

Минорная версия пакета кодирует версию API (`0.5199.x` ↔ API `5.199`); `API_VERSION` генерируется из схемы и закреплён тестом.

## Подробнее

- [Типы](/api-schema/types/) — именование, EnumNames, API_VERSION, MethodMap
- [Валидаторы](/api-schema/validators/) — zod и valibot, гранулярные импорты
- [Версии](/api-schema/versioning/) — минор как версия VK API, обновление схемы

## Ссылка

- [npm: @vkma.dev/api-schema](https://www.npmjs.com/package/@vkma.dev/api-schema)
