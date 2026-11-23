---
title: "Cloudflare Tunnel: быстрый URL и стабильный домен"
description: "Второй провайдер пакета, с одноразовым URL без аккаунта или стабильным доменом через токен из дашборда Cloudflare."
sidebar:
    order: 1
    label: "Cloudflare Tunnel"
---

`cloudflared` работает на уровне HTTP. TLS завершается на краю Cloudflare, браузер говорит по HTTP/2, и первому запросу не нужно рукопожатие через релей.. С одной и той же машины первый запрос через `opentunnel` занял 0,79 с, а через `cloudflared` от 0,28 до 0,35 с.

Нужен [бинарник `cloudflared`](https://developers.cloudflare.com/tunnel/downloads/) в `PATH`. Пакет его не скачивает.

## Quick: URL без аккаунта

```sh
vkma-tunnel --provider cloudflared
# или в vite.config.ts: vkmaTunnel({ provider: "cloudflared" })
```

- Адрес одноразовый, вида `https://<случайное-имя>.trycloudflare.com`, и меняется на каждом запуске. Он подходит, чтобы открыть приложение с телефона. Для настроек VK-приложения он не подходит.
- Адрес может не отвечать до минуты. Пакет не печатает его, пока тот не ответит. Если минута прошла, пакет печатает адрес без проверки.
- Пакет ничего не сохраняет. Профиль и идентичность `opentunnel` остаются нетронутыми.
- [Cloudflare ограничивает Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/): 200 одновременных запросов, лишние получают `429`; Server-Sent Events не работают; гарантий аптайма нет.
- Доступ открыт любому, у кого есть ссылка.

## Token: стабильный домен

Создай named tunnel в [дашборде Cloudflare](https://one.dash.cloudflare.com/). Добавь ему публичное имя хоста на своём домене и направь на `http://localhost:<порт>`. Токен передавай только через переменную окружения.

```sh
export TUNNEL_TOKEN=… # токен из дашборда, не клади его в argv и в файл
vkma-tunnel --provider cloudflared --cloudflared-mode token --cloudflared-hostname app.example.com
```

```ts
// vite.config.ts
vkmaTunnel({
    provider: "cloudflared",
    cloudflared: { mode: "token", hostname: "app.example.com" },
});
```

Пакет читает и ключ `cloudflared.token` в конфиге. Но `vite.config.ts` обычно попадает в репозиторий, поэтому держи токен в `TUNNEL_TOKEN`.

Что учесть в token-режиме:

- Заголовок `Host` задаёт дашборд. Дашборд решает, куда идёт трафик, поэтому пакет не может переписать `Host`. Открой настройки туннеля, раздел _Additional application settings → HTTP_, и поставь `Host header` в `localhost:<порт>`. Vite пропускает такой `Host` в `allowedHosts`. Или добавь имя хоста в `server.allowedHosts`. Если пакет не может переписать `Host`, он печатает предупреждение.
- Профиль принадлежит одному провайдеру. Режимы, которые пишут запись (opentunnel и token), откажутся работать под профилем другого провайдера. Возьми другой `--profile`. Quick-режим ничего не пишет и запускается под любым профилем.
- По умолчанию транспорт `http2`. Там, где закрыт UDP 7844, `quic` регистрируется и умирает каждые несколько секунд. Включить его можно только явно, ключом `cloudflared: { protocol: "quic" }`.

## Host-заголовок

В quick-режиме `cloudflared` сам переписывает `Host` в `localhost:<порт>`. Проверка `allowedHosts` в Vite проходит без правок конфига, и HMR работает.

Если серверу нужен настоящий публичный `Host`, отключи переписывание ключом `hostRewrite: false` (в CLI `--no-host-rewrite`) и разреши суффикс. Имя хоста каждый раз новое, поэтому отдельное имя в `allowedHosts` не поможет:

```ts
// vite.config.ts
export default {
    server: { allowedHosts: [".trycloudflare.com"] },
};
```

Без этого правила Vite отвечает `403 Blocked request`. С ним страница и HMR открываются.

## Дальше

- [Описание пакета](/tunnel/), плагин, CLI, профиль и стабильный URL.
