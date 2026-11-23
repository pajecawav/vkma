---
title: "@vkma.dev/tunnel — публичные HTTPS-туннели к локальному серверу"
description: "Публичный HTTPS-адрес для локального dev-сервера, чтобы открыть сборку на телефоне без деплоя."
sidebar:
    order: 0
    label: "Описание"
---

`@vkma.dev/tunnel` даёт локальному dev-серверу публичный HTTPS-адрес. По нему сборку можно открыть на телефоне или отдать ссылку коллеге, ничего не деплоя. В пакете три входа: Vite-плагин, CLI `vkma-tunnel` и Node API. Провайдера два:

| Провайдер                   | URL                                                              | Что нужно                                                             |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `opentunnel` (по умолчанию) | стабильный, `https://<id>.opentunnel.xyz`                        | ничего: аккаунт не нужен, ключ остаётся на твоей машине               |
| `cloudflared`               | одноразовый `*.trycloudflare.com` или стабильный на твоём домене | бинарник `cloudflared`, для стабильного адреса ещё аккаунт Cloudflare |

## Быстрый старт

Vite-плагин не требует опций:

```ts
// vite.config.ts
import { vkmaTunnel } from "@vkma.dev/tunnel/vite";

export default {
    plugins: [vkmaTunnel()],
};
```

```sh
npm install -D @vkma.dev/tunnel
# или: pnpm add -D / yarn add -D / bun add -D
npm run dev
```

Плагин читает фактический порт dev-сервера, поднимает туннель и печатает адрес рядом со строками Vite:

```text
  ➜  Local:   http://localhost:5173/
  ➜  tunnel  →  https://4bznf5jcbkct.opentunnel.xyz  (profile my-app · localhost:5173)
```

С `vite preview` плагин работает так же. Прод-сборку тоже можно открыть на телефоне без деплоя.

Запросы доходят до Vite без правок конфига. Пакет переписывает заголовок `Host` в адрес, который Vite всегда пропускает. HMR работает через туннель. Если туннель упал, dev-сервер продолжает работать, а в терминале появляется красная строка.

Опции (все необязательные): `enabled`, `config`, `provider`, `profile`, `qr`, `open`, `keepAlive`, `hostRewrite` и секция провайдера, `opentunnel` или `cloudflared`, с теми же ключами, что в конфиге. Плагин туннелирует тот сервер, к которому подключён.

## CLI

```sh
npx @vkma.dev/tunnel                        # открыть http://localhost:5173
npx @vkma.dev/tunnel --provider cloudflared # одноразовый URL без аккаунта
```

| Команда                                     | Что делает                                                      |
| ------------------------------------------- | --------------------------------------------------------------- |
| `vkma-tunnel [run] [флаги]`                 | поднимает туннель и печатает URL, Ctrl+C останавливает          |
| `vkma-tunnel reset [--profile имя] [--all]` | удаляет сохранённые идентичности, их URL перестают работать     |
| `vkma-tunnel list [--json]`                 | показывает сохранённые профили, их URL и адреса целей           |
| `vkma-tunnel status [профиль] [--json]`     | показывает сохранённую идентичность и результат проб цели и URL |

Флаги: `--provider`, `--port`, `--host`, `--profile`, `--config`, `--qr`, `--open`, `--no-keepalive`, `--no-host-rewrite`, `--json`, `--quiet`, `--no-color`. У флагов провайдера есть его префикс: `--opentunnel-route`, `--opentunnel-api`, `--cloudflared-mode`, `--cloudflared-hostname`, `--cloudflared-protocol`, `--cloudflared-binary`.

## Профиль и стабильный URL

У `opentunnel` адрес не меняется между запусками. Пакет хранит идентичность по профилю, по умолчанию это имя директории проекта. Поэтому URL, вписанный в настройки VK-приложения, продолжает работать. На первом запуске пакет ждёт выпуска сертификата. На сервисе это может занять несколько минут.

```sh
vkma-tunnel --profile my-app        # другой профиль, другой адрес
vkma-tunnel list                    # что сохранено
vkma-tunnel reset --profile my-app  # удалить идентичность
```

После `reset` старый URL перестаёт работать, а следующий запуск выдаёт новый.

## Конфиг

Пакет ищет `vkma-tunnel.config.{ts,mts,js,mjs,json}`, поднимаясь от текущей директории. Приоритет такой: флаги CLI и опции плагина, затем файл, затем значения по умолчанию.

```ts
// vkma-tunnel.config.ts
import { defineTunnelConfig } from "@vkma.dev/tunnel";

export default defineTunnelConfig({
    provider: "opentunnel", // по умолчанию; или "cloudflared"
    port: 5173, // по умолчанию
    host: "localhost", // по умолчанию
    // profile: "my-app", // по умолчанию имя директории проекта
    // Настройки провайдера живут в его секции, а не наверху:
    // opentunnel: {
    //     route: "@", // по умолчанию https://<id>.opentunnel.xyz, или метка сабдомена
    //     api: "https://opentunnel.example", // свой сервер
    // },
});
```

Наверху находятся только ключи, которые понимает любой провайдер: `provider`, `port`, `host`, `profile`. Секция при чужом провайдере даёт ошибку конфига. Пакет не принимает ключ, который провайдер молча проигнорирует. `port` и `host` из файла действуют для CLI и Node API. Плагин туннелирует живой Vite-сервер.

## Node API

```ts
import { createTunnel } from "@vkma.dev/tunnel";

const tunnel = await createTunnel({ port: 5173 });
console.log(tunnel.primaryUrl); // https://<id>.opentunnel.xyz

await tunnel.close();
```

`createTunnel(options)` резолвится, когда туннель поднят. Кроме полей конфига options принимает `signal`, `onEvent`, `onProgress`, `onWarning`, `keepAlive` и `hostRewrite`. Поля хендла `hostname`, `urls` и `primaryUrl` следуют за провайдером. Событие `url-changed` означает, что URL сменился у того же хендла.

## Что важно знать

- URL публичный. Любой, у кого есть ссылка, попадает на твой dev-сервер. В `opentunnel` и в Quick Tunnel от Cloudflare авторизации нет. Если URL утёк, выполни `reset`.
- Остановка Vite закрывает туннель. Это происходит по Ctrl+C, по `q` и по SIGTERM. Сервис сразу отпускает маршрут. Без этого следующий запуск упирался бы в ошибку `route_conflict`.
- Vite отвечает "Blocked request" на чужой заголовок `Host`. По умолчанию пакет переписывает заголовок за тебя. Отключи переписывание, только если серверу нужен настоящий публичный `Host`. Тогда передай `hostRewrite: false` (в CLI `--no-host-rewrite`) и добавь адрес в `server.allowedHosts`.

## Дальше

- [Cloudflare Tunnel](/tunnel/cloudflared/), quick и token, заголовок Host в дашборде.

## Ссылки

- [npm: @vkma.dev/tunnel](https://www.npmjs.com/package/@vkma.dev/tunnel)
