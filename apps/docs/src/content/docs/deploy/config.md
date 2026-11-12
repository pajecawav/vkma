---
title: "Конфигурация vkma-deploy и легаси vk-hosting-config.json"
description: "Поля vkma-deploy.config.ts, поиск файла, легаси vk-hosting-config.json."
sidebar:
    order: 2
    label: "Конфигурация"
---

## Поиск файла

Поиск идёт вверх от текущей директории; на каждом уровне побеждает первый найденный файл, ближний файл бьёт тип файла. Один файл — вся правда, мерджа между конфигами нет.

1. `vkma-deploy.config.{ts,mts,js,mjs,json}` (предпочтительно)
2. `vk-hosting-config.json` (легаси-формат, [ниже](#легаси-vk-hosting-configjson))

`--config <path>` задаёт файл явно, минуя поиск (команда `init` его не поддерживает).

TypeScript-конфиги работают без лишних зависимостей, достаточно нативного type stripping в Node >= 22.18:

```ts
// vkma-deploy.config.ts
import { defineDeployConfig } from "@vkma.dev/deploy";

export default defineDeployConfig({
    appId: 42,
    staticPath: "./build",
    endpoints: { mobile: "index.html", web: "index.html" },
    environment: "both",
});
```

JSON-конфиги получают автодополнение через `$schema`:

```jsonc
{
    "$schema": "https://unpkg.com/@vkma.dev/deploy/schema/vkma-deploy.config.schema.json",
    "appId": 42,
    "staticPath": "./build",
}
```

## Поля

| Поле              | Тип                                     | По умолчанию                             | Что делает                                                                          |
| ----------------- | --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `appId`           | integer >= 1                            | — (обязательно)                          | ID мини-аппы; или `VKMA_APP_ID` / `MINI_APPS_APP_ID`                                |
| `staticPath`      | string                                  | — (без `bundle`)                         | Директория сборки, которая зипается и грузится, например `"./build"`                |
| `bundle`          | string                                  | —                                        | Готовый `.zip`; зипание пропускается, с `staticPath` несовместим                    |
| `endpoints`       | `{ mobile?, mvk?, web? }`, минимум один | — (обязательно)                          | Входные файлы по платформам; проверяются и отправляются только заданные             |
| `environment`     | `"dev"` \| `"production"` \| `"both"`   | `"both"`                                 | Целевое окружение                                                                   |
| `updateProd`      | boolean                                 | — (см. [CLI](/deploy/cli/#политика-url)) | Переключать продакшн-URL; независимо от `updateDev`                                 |
| `updateDev`       | boolean                                 | —                                        | Переключать dev-URL; те же правила незаданного значения                             |
| `testGroupName`   | string                                  | —                                        | Деплой в именованную тестовую группу (только dev)                                   |
| `accessToken`     | string                                  | —                                        | Токен; лучше env-переменная или `vkma-deploy login`, чем коммит                     |
| `proxy`           | string (`http(s)://…`)                  | —                                        | HTTP(S)-прокси для всего трафика CLI; подробности в [Env и CI](/deploy/env-and-ci/) |
| `apiHost`         | string                                  | `"https://api.vk.ru/method/"`            | Базовый URL VK API                                                                  |
| `oauthHost`       | string                                  | `"https://oauth.vk.ru/"`                 | Базовый URL OAuth                                                                   |
| `apiVersion`      | string                                  | `"5.199"`                                | Версия VK API                                                                       |
| `oauthClientId`   | integer                                 | `6670517`                                | OAuth-клиент device flow                                                            |
| `queueTimeoutSec` | integer                                 | `600`                                    | Дедлайн ожидания очереди хостинга, секунд                                           |

`endpoints` без единой платформы — ошибка конфига: VK не обрабатывает задачу без `endpoint_*`-параметров, очередь молчит вечно. Отсутствие файла платформы, которая задана, ловится на прекфлайте.

## Валидация

Новый формат строгий: неизвестное или опечатанное поле валит валидацию с именем ключа, а не молча деплоит дефолты (классика — `static_path` в `vkma-deploy.config.*`). `$schema` в JSON-файлах разрешён для автодополнения; TS-конфиги типизированы через `defineDeployConfig` и `$schema` не несут.

## Легаси vk-hosting-config.json

Легаси-файл маппится автоматически; каждое нераспознанное или неподдерживаемое поле даёт предупреждение. Молчаливых потерь нет.

| Легаси-поле       | Куда маппится   | Примечание                             |
| ----------------- | --------------- | -------------------------------------- |
| `app_id`          | `appId`         |                                        |
| `static_path`     | `staticPath`    |                                        |
| `endpoints`       | `endpoints`     |                                        |
| `access_token`    | `accessToken`   |                                        |
| `bundleFile`      | `bundle`        |                                        |
| `update_prod`     | `updateProd`    | `0`/`1`/boolean                        |
| `update_dev`      | `updateDev`     |                                        |
| `test_group_name` | `testGroupName` |                                        |
| `api_host`        | `apiHost`       |                                        |
| `oauth_host`      | `oauthHost`     |                                        |
| `noprompt`        | —               | Игнорируется; эквивалент — `--yes`     |
| `debug`           | —               | Игнорируется; эквивалент — `--verbose` |
| `proxy_url`       | —               | Не поддерживается; используй `proxy`   |
| `expires_in`      | —               | Игнорируется                           |

## Приоритет и проверка

Порядок применения: флаги CLI > env-переменные > конфиг > дефолты. Проверить, что реально увидит деплой: `vkma-deploy config` печатает резолвнутый конфиг с источником каждого значения и всеми предупреждениями; `accessToken` в выводе скрыт.
