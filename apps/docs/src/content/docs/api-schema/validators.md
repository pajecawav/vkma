---
title: Валидаторы
description: "zod и valibot: суффикс Schema, MethodSchemas и гранулярные импорты ради cold-start."
sidebar:
    order: 2
---

Схемы живут в двух subpath — `@vkma.dev/api-schema/zod` и `@vkma.dev/api-schema/valibot`. Имена в обоих одинаковые, с суффиксом `Schema`.

```sh
npm install @vkma.dev/api-schema zod      # или valibot — что используешь
```

Оба пира опциональны и нужны ровно тогда, когда ты импортируешь соответствующий subpath: zod ^4, valibot ^1. Потребители только типов из корня не тянут ни тот, ни другой.

## Схемы

```ts
import { AppsGetCatalogParamsSchema } from "@vkma.dev/api-schema/zod";

AppsGetCatalogParamsSchema.parse({ count: 10 });
```

```ts
import { BaseObjectSchema } from "@vkma.dev/api-schema/valibot";

BaseObjectSchema.parse({ id: 1, title: "app" });
```

Для доверенных границ (ответы API, чужой ввод) удобнее `safeParse` — без исключений, с деревом ошибок:

```ts
const result = MessagesSendParamsSchema.safeParse(input);

if (!result.success) {
    // result.error — issues с путями до невалидных полей
}
```

## MethodSchemas

Рантайм-коллега `MethodMap`: тот же точечный ключ, слоты `params` и `response`. Прямой кандидат на проверку входа и выхода API-клиента:

```ts
import { MethodSchemas } from "@vkma.dev/api-schema/zod";

const schema = MethodSchemas["apps.getCatalog"];
schema.params.parse({ count: 10 });
schema.response.parse(await callVkApi("apps.getCatalog", { count: 10 }));
```

Правила те же, что у [MethodMap](/api-schema/types/): `params` есть у каждого метода, `response` — только у задокументировавших ответ. В рантайм-слоте `response` лежит базовый вариант (`<method>_response`); extended-варианты (`…_extended_response` и прочие) — отдельные именованные экспорты. Слоты объявлены как `z.ZodType<…>` / `v.GenericSchema<…>` — вызовы `parse`/`safeParse` доступны в обоих субпэтах одинаково.

## Гранулярные импорты

Баррели `/zod` и `/valibot` реэкспортируют всё, и в обычном Node без tree-shaking один импорт из барреля вычисляет весь пакет — тысячи схем. Когда важен cold-start (serverless, CLI), импортируй секционный модуль напрямую:

```ts
import { BaseObjectSchema } from "@vkma.dev/api-schema/valibot/base/objects";
import { MessagesSendParamsSchema } from "@vkma.dev/api-schema/zod/messages/methods";
```

Спецификаторы без расширений. Секция — домен VK API, их около шестидесяти: `account`, `ads`, `apps`, `base`, `messages`, `users`, `wall`, `widgets`, …; файл — `methods`, `objects` или `responses`.

## zod или valibot

Имена, структура и гранулярные пути совпадают — выбирай по валидатору, который уже в проекте, и импортируй из его subpath. Версию API, под которую собраны схемы, смотри в [версиях](/api-schema/versioning/).
