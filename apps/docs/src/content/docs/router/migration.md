---
title: "Миграция с vk-mini-apps-router"
description: "Перенос приложения с @vkontakte/vk-mini-apps-router: маппинг API и правила."
sidebar:
    order: 5
---

Новый роутер даёт feature parity со старым `@vkontakte/vk-mini-apps-router`, но API другой: кодовые маршруты TanStack, типизированная навигация по зарегистрированному дереву, VKUI рендерится хостами пакета. Ниже — маппинг по кускам.

## Установка и сетап

```ts
// старый
import { createHashRouter, RouterProvider } from "@vkontakte/vk-mini-apps-router";
const router = createHashRouter(routes);

// новый
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";

const app = createApp({
    views: {
        main: {
            panels: {
                index: { path: "/", component: HomePanel },
                list: { path: "/list", component: ListPanel },
            },
        },
    },
});

const router = createRouter({
    routeTree: app.routeTree,
    history: createVkHistory(),
    defaultNotFoundComponent: NotFound,
});
```

`createVkHistory()` заменяет все три старые фабрики:

```ts
createVkHistory(); // = старый createHashRouter (#/path, дефолт)
createVkHistory({ mode: "hash-param" }); // = старый createHashParamRouter (#?path=…)
// старый createBrowserRouter = дефолтная история TanStack (опусти history)
```

Оба hash-режима разрешают глубокие ссылки, записанные в другом режиме (легаси-толерантность).

Инлайн-форма `views: Record<string, ViewOptions>` выше — для маленьких приложений: она даёт типизированную карту `app.panels`. Для реальных приложений рекомендованы хабы `defineView`, см. [вьюхи и панели](/router/views-and-panels/).

## Конфиг маршрутов → билдеры

```ts
// старый: плоские объекты с метаданными view/panel
const routes = [{ path: "/", panel: "home", view: "main" }, /* … */];

// новый: дерево и есть конфиг; порядок панелей = поток навигации
// (цепочка inflate + направление анимации VKUI)
createApp({
    views: {
        main: {
            panels: {
                index: { component: HomePanel },          // путь "/"
                list: { path: "/list", component: ListPanel },
                item: { path: "/item/$id", component: Item, lazy: routeId => import(/* … */) },
            },
        },
    },
});
```

Опции TanStack (`loader`, `beforeLoad`, `validateSearch`, …) проходят в каждый узел нетронутыми.

## Навигация

```ts
// старый
const routeNavigator = useRouteNavigator();
routeNavigator.push({ panel: "persik", params: { id } });
routeNavigator.back();

// новый (типизирован зарегистрированным деревом)
const navigator = useNavigator();
navigator.push({ to: "/item/$id", params: { id } });
navigator.back(); // также backToFirst(), replace()
```

## Модалки

```ts
// старый: id модалок в конфиге, showModal пишет history.state
createModal("persik_modal", "/persik_modal");
routeNavigator.showModal("persik_modal");
routeNavigator.hideModal();

// новый: модалки — дочерние маршруты панели; цепочки — сиблинги.
// Переход к модалке при открытой другой заменяет запись;
// хост закрывает старый лист до открытия нового.
createPanel("/item/$id", { component: Item, modals: { details: DetailsModal } });
navigator.showModal({ to: "/item/$id/details", params: { id } });
navigator.hideModal();
```

Глубокие ссылки в пути модалок работают; глобальные модалки `?modal=<id>` открываются с любой панели через `navigator.showGlobalModal(id)` (URL маскируется обратно к пути панели). Подробности в [модалках и popout'ах](/router/modals-and-popouts/).

## Popout'ы

```ts
// старый: React-элементы через навигатор
routeNavigator.showPopout(<Alert onClose={() => routeNavigator.hidePopout()} />);

// новый: id + сериализуемые props в history.state, компоненты в реестре
// (back закрывает popout, props восстанавливаются на back/forward)
createApp({ popouts: { confirm: ConfirmAlert } });
navigator.showPopout("confirm", { itemId: 42 });
navigator.hidePopout();
```

Компонент popout'а получает `onClose` от хоста. Прокинь его в `onClosed` своего VKUI-компонента.

## Хуки

| Старый                                         | Новый                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `useParams({ panel: id })`                     | `usePanelParams(panelHandle.routeId)` (freeze-safe во время back-анимации)                                                                  |
| `useSearchParams`                              | `usePanelSearch` / TanStack `useSearch` + `validateSearch`                                                                                  |
| `useMetaParams`                                | `location.state` (`useRouterState`)                                                                                                         |
| `useActiveVkuiLocation` / `useGetPanelForView` | не нужны — `VkView` ведёт VKUI напрямую; позиция через VKUI `useNavId`                                                                      |
| `useFirstPageCheck`                            | `!router.history.canGoBack()`                                                                                                               |
| `useHistoryManager`                            | внутренний (зеркало панелей); выведем наружу по запросу                                                                                     |
| `useBlocker` / `routeNavigator.block`          | `navigator.block(onLeave)` — колбэк получает `{ currentLocation, nextLocation, action }` (back/forward/go = POP); или TanStack `useBlocker` |
| `useEnableSwipeBack`                           | `useEnableSwipeBack(enabled, panelRef)` — override панели; полный отказ `createSwipeBackManager({ enabled: false })`                        |
| `RouterLink`                                   | TanStack `Link` (импорт из `@tanstack/react-router`)                                                                                        |

## Глубокие ссылки и inflate

Глубокая ссылка восстанавливает точный экран, включая модалки. При старте не на первой панели поток панелей до неё проигрывается автоматически (замена старого `hierarchy` + search-параметра `inflate`). Отключай через `createApp({ inflate: false })`.

## Что не перенесено

- Маршрутизация `Root`/`Epic` с мульти-сториями: рендер `VkView` на каждую историю внутри собственного `Epic` (билдеры и так работают на уровне вьюх).
- Пропсы `interval`/`throttled` у RouterProvider: не нужны, панели остаются смонтированными во время переходов в модели статических детей.

История и swipe-back описаны в [истории и хосте](/router/history/).
