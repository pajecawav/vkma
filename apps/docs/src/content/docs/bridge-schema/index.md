---
title: bridge-schema
description: "Каталог всех событий VK Bridge как данные: JSON Schema и типы TypeScript."
sidebar:
    order: 0
---

`@vkma.dev/bridge-schema` — JSON Schema каталог всех событий VK Bridge: request props методов, данные ответов и событий, проводка `Result`/`Failed`, с типами TypeScript поверх. Референсный каталог — [VKCOM/vk-bridge](https://github.com/VKCOM/vk-bridge) (MIT).

```sh
npm install @vkma.dev/bridge-schema
```

## Типы

Корневой entrypoint экспортирует типы полезных нагрузок и три карты каталога:

- `RequestPropsMap`: request props каждого отправляемого метода
- `ReceiveDataMap`: данные каждого принимаемого события
- `ReceiveEventMap`: проводка метода к именам его событий `Result`/`Failed`

```ts
import type { RequestPropsMap, UserInfo } from "@vkma.dev/bridge-schema";

type InitProps = RequestPropsMap["VKWebAppInit"];
```

## Расширение каталога

Карты объявлены `interface`'ами в корне пакета специально ради **declaration merging**: добавь свои события (или события прокси-бэкенда) без форков.

```ts
declare module "@vkma.dev/bridge-schema" {
    interface RequestPropsMap {
        VKWebAppMyCustomMethod: { foo: string };
    }
    interface ReceiveDataMap {
        VKWebAppMyCustomMethodResult: { bar: number };
        VKWebAppMyCustomMethodFailed: { error_type: string };
    }
    interface ReceiveEventMap {
        VKWebAppMyCustomMethod: {
            result: "VKWebAppMyCustomMethodResult";
            failed: "VKWebAppMyCustomMethodFailed";
        };
    }
}
```

После этого `send("VKWebAppMyCustomMethod", { foo: "x" })` полностью типизирован через [`@vkma.dev/bridge`](/bridge/) (он резолвит типы ответов по этим картам).

Два правила:

- **Цель аугментации — `@vkma.dev/bridge-schema`.** Мерджится только модуль, объявляющий интерфейсы; реэкспорты не мерджатся.
- **Только расширение.** TS interface merging не меняет существующие члены; правки встроенного каталога едут релизами схемы.

## Каталог как данные

`@vkma.dev/bridge-schema/schema` экспортирует сырой JSON-документ для рантайм-потребителей: панелей devtools, инспекторов, валидаторов.

## Подробнее

- [Расширение каталога](/bridge-schema/extending/) — аугментация трёх мап, свои методы и события
- [Каталог как данные](/bridge-schema/data/) — субпаты /schema и /catalogue, валидация, заготовки props

## Ссылка

- [npm: @vkma.dev/bridge-schema](https://www.npmjs.com/package/@vkma.dev/bridge-schema)
