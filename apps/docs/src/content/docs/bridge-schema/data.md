---
title: "Каталог как данные"
description: "Субпаты /schema и /catalogue: сырой JSON-документ, таблицы проводки и заготовки props."
sidebar:
    order: 2
---

Помимо типов, пакет экспортирует каталог как рантайм-данные: JSON Schema документ и таблицы проводки. Панели devtools, инспекторы и валидаторы читают именно их.

## Субпаты

| Субпат       | Экспортирует                | Для чего                                        |
| ------------ | --------------------------- | ----------------------------------------------- |
| `/schema`    | `eventsSchema`, `catalogue` | Полный JSON Schema документ с `$defs`           |
| `/catalogue` | `catalogue`, `stubs`        | Проводка и заготовки props без тяжёлого `$defs` |

```ts
import { catalogue, eventsSchema } from "@vkma.dev/bridge-schema/schema";

catalogue.props.VKWebAppInit; // "VKWebAppInitProps" — имя определения в $defs
catalogue.events.VKWebAppGetAuthToken; // { result: "VKWebAppAccessTokenReceived", failed: "VKWebAppAccessTokenFailed" }
eventsSchema.$defs.UserInfo; // JSON Schema узел полезной нагрузки
```

## Форма документа

`eventsSchema` — JSON Schema draft 2020-12:

- `$defs` — 270 определений полезных нагрузок (обычные объекты, enum'ы, `anyOf`-ветки);
- `x-vkma-catalogue` — три таблицы проводки: `props` (96 отправляемых методов), `receive` (115 принимаемых имён), `events` (94 метода с проводкой `Result`/`Failed`).

Записи таблиц ссылаются на `$defs` по имени. Типы TypeScript в корневом entrypoint сгенерированы из этого же документа. Данные и типы не расходятся.

```ts
import type { EventsCatalogue, EventsSchemaDocument } from "@vkma.dev/bridge-schema/schema";

const wiring: EventsCatalogue["events"] = catalogue.events;
const doc: EventsSchemaDocument = eventsSchema;
```

## Валидация

`$defs` — обычный JSON Schema документ. Если данные приходят извне (запись из логов, чужой коллектор), проверяй их своим валидатором:

```ts
import { eventsSchema } from "@vkma.dev/bridge-schema/schema";
import { Ajv2020 } from "ajv/dist/2020.js";

const ajv = new Ajv2020();
const validateUserInfo = ajv.compile(eventsSchema.$defs.UserInfo);

if (validateUserInfo(data)) {
    // data соответствует каталогу для VKWebAppGetUserInfo
}
```

## Заготовки props

`stubs` из `/catalogue` — метод → минимальный объект из обязательных props, прекомпьютировано из `$defs` при генерации (только обязательные ключи, с лимитом глубины, первая ветка `anyOf`; всё невыводимое просто отсутствует):

```ts
import { stubs } from "@vkma.dev/bridge-schema/catalogue";

stubs.VKWebAppStorageGet; // { keys: [] }
stubs.VKWebAppShowWallPostBox; // { attachments: "" }
```

Применение — панель с формой «выбери метод, получи заготовку props»: devtools execute и инспектор так предзаполняют поля, не таща весь `$defs` в бандл.

Аугментация `declare module` на данные не влияет. [`extending`](/bridge-schema/extending/) расширяет только типы.
