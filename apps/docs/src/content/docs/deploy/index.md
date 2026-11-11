---
title: deploy
description: "Деплой VK Mini Apps в хостинг VK: drop-in замена vk-miniapps-deploy."
sidebar:
    order: 0
    label: "Описание"
---

`@vkma.dev/deploy` — CLI и библиотека деплоя для хостинга [VK Mini Apps](https://vk.ru/mini-apps), drop-in-совместимая замена `@vkontakte/vk-miniapps-deploy`.

```sh
npx @vkma.dev/deploy        # или: pnpm dlx / yarn dlx / bunx
vkma-deploy                 # деплой по конфигу в проекте
```

**Drop-in совместимость.** Существующая настройка продолжает работать:

- читает `vk-hosting-config.json` (легаси-формат) как fallback
- читает env-переменные `MINI_APPS_ACCESS_TOKEN`, `MINI_APPS_APP_ID`, `MINI_APPS_ENVIRONMENT`, `CI_URLS` (навсегда, без депрекации)
- переиспользует токен официального тула, так что миграция не требует перелогина

## Быстрый старт

```sh
npm install -D @vkma.dev/deploy
npx vkma-deploy init          # создать vkma-deploy.config.ts (интерактивно)
npx vkma-deploy login         # разовая авторизация в браузере
npx vkma-deploy --dry-run     # проверить конфиг и собрать без загрузки
npx vkma-deploy               # деплой
```

`init` не трогает существующий конфиг (указывает на файл для правки), импортирует значения из легаси-`vk-hosting-config.json`, если он лежит в текущей директории (токен в новый файл не копируется никогда), и спрашивает только недостающее. В CI передавай значения флагами: `npx vkma-deploy init --app-id 42 --endpoints mobile,web`.

## Конфигурация

Поиск идёт вверх от текущей директории; на каждом уровне побеждает первый найденный файл (ближайший файл бьёт тип файла). Один файл — вся правда, мерджа между конфигами нет.

1. `vkma-deploy.config.{ts,mts,js,mjs,json}` (предпочтительно)
2. `vk-hosting-config.json` (легаси-формат, snake_case, маппится автоматически с предупреждениями об игнорируемом)

TypeScript-конфиги работают без лишних зависимостей (нативный type stripping, Node >= 22.18):

```ts
// vkma-deploy.config.ts
import { defineDeployConfig } from "@vkma.dev/deploy";

export default defineDeployConfig({
    appId: 42,
    staticPath: "./build",
    environment: "both", // "dev" | "production" | "both"
});
```

JSON-конфиги получают автодополнение через `$schema`:

```jsonc
// vkma-deploy.config.json
{
    "$schema": "https://unpkg.com/@vkma.dev/deploy/schema/vkma-deploy.config.schema.json",
    "appId": 42,
    "staticPath": "./build",
}
```

## Дальше

- [CLI](/deploy/cli/) — команды, флаги, промпты, exit-коды.
- [Конфигурация](/deploy/config/) — все поля конфига и легаси-формат.
- [Env и CI](/deploy/env-and-ci/) — переменные окружения, деплой в CI, прокси.

## Ссылки

- [npm: @vkma.dev/deploy](https://www.npmjs.com/package/@vkma.dev/deploy)
