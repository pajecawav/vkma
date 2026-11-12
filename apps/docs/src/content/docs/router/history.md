---
title: "История и хост"
description: "Режимы hash и hash-param, синхронизация через VKWebAppSetLocation и swipe-back."
sidebar:
    order: 4
---

Мини-апп живёт в iframe webview: у него нет собственной адресной строки, а «назад» — это системный жест или кнопка хоста. Пакет берёт на себя три вещи: где хранить URL, как сообщать его хосту и когда включать нативный swipe-back.

## Режимы истории

`createVkHistory` из core-слоя:

```ts
createVkHistory(); // "hash" (дефолт): #/meeting/7
createVkHistory({ mode: "hash-param" }); // #?path=/meeting/7
// "browser": опусти history в createRouter — TanStack возьмёт свою
```

- **`hash`** — хэш и есть локация. Актуально, когда хост не даёт управлять path.
- **`hash-param`** — путь ездит в hash-параметре `path` (имя меняется через `pathParam`). Чужие hash-параметры сохраняются, `location.search` не трогается.
- **`browser`** — обычная история браузера; просто не передавай `history` в `createRouter`.

Глубокая ссылка, написанная в другом режиме, тоже разрешается (легаси-толерантность), старые рассылки не ломаются. История построена на `createBrowserHistory` TanStack. Блокеры и popstate работают как в обычном TanStack.

## Синхронизация с хостом

`createBridgeSync` связывает историю и хост в обе стороны:

```ts
import { createBridgeSync } from "@vkma.dev/router";

createBridgeSync({ history: router.history, bridge });
```

- Каждый зафиксированный шаг истории отправляется хосту как `VKWebAppSetLocation` с `replace_state: true`. URL шеринга и кнопка «назад» хоста отражают состояние приложения. Локация старта отправляется один раз при создании.
- Входящие `VKWebAppChangeFragment` и `VKWebAppLocationChanged` (прыжок, инициированный хостом) превращаются в `history.replace(href)`. Эхо собственной локации игнорируется, цикл не возникает.
- «Назад» хоста — это территория `VKWebAppClose`: ChangeFragment не является pop'ом фрагмента.

Кодеки payload зависят от режима: hash отправляет содержимое хэша, hash-param — `?path=…` с сохранением чужих параметров. Вызывай sync после создания роутера (не в module scope рядом с его объявлением), иначе цикл модулей падает с TDZ.

## Swipe-back

`createSwipeBackManager` управляет нативным жестом:

```ts
import { createSwipeBackManager } from "@vkma.dev/router";

createSwipeBackManager({ history: router.history, bridge });
```

Автоматическое правило: жест включён, пока приложение может вернуться в своей истории, и выключен на первой записи. Там системный «назад» должен закрывать приложение. Реализация шлёт `VKWebAppSetSwipeSettings { history }` плюс `VKWebAppEnableSwipeBack`/`VKWebAppDisableSwipeBack`; ошибка с кодом 6 на вебе заглушена.

Полный отказ (приложение само управляет жестом): `createSwipeBackManager({ enabled: false })` — жёсткий opt-out, побеждающий всё ниже.

## Точечный override в панели

```tsx
useEnableSwipeBack(false, panel);
```

Передай `false` для поверхностей, где жест мешает (рисование, drag), и обязательно второй аргумент, хэндл панели. Панели — вечно смонтированные статические дети: без привязки override прилипнет к той панели, что смонтировалась последней, а с ref он действует, только пока эта панель сматчена глубже всех, и отпускается при уходе. `true` форсирует жест даже на первой записи. Системный «назад» тогда закрывает приложение.

Оверлеи поверх истории описаны в [модалках и popout'ах](/router/modals-and-popouts/).
