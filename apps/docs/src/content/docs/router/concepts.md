---
title: "Концепции"
description: "URL-driven навигация, четыре слоя пакета и аддитивность над TanStack Router."
sidebar:
    order: 1
---

Всё состояние навигации живёт в URL: вьюха, панель, модалка и popout — это маршруты TanStack Router. Кнопка «назад» хоста, перезагрузка и глубокая ссылка восстанавливают экран без отдельного стора навигации.

## Feature parity, не API parity

`@vkma.dev/router` — наследник `@vkontakte/vk-mini-apps-router`: весь функционал старого роутера здесь есть, но API другой. Строковые id панелей заменены типизированными хэндлами, объектный конфиг маршрутов — билдерами, а внутри работает [TanStack Router](https://tanstack.com/router). Если переходишь со старого пакета — начни с [гайда миграции](/router/migration/).

## Четыре слоя

Один пакет, четыре субпат-экспорта. Слои направлены строго вниз:

| Импорт                    | Слой                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| `@vkma.dev/router`        | core без React: `createVkHistory`, `createBridgeSync`, `createSwipeBackManager` |
| `@vkma.dev/router/react`  | data-хуки с freeze-семантикой: `usePanelParams` и соседи, `usePanelsHistory`    |
| `@vkma.dev/router/vkui`   | VKUI-хосты: `VkView`, `Modals`, `Popouts`, `NotFound`, `ModalPageSurface`       |
| `@vkma.dev/router/preset` | `createApp` + `defineView`/`definePanel`, `useNavigator`, `createVkLink`, сахар |

Два правила держат сли чистыми:

- VKUI не протекает ниже `/vkui` — core работает в любом React-окружении, даже без VKUI.
- Мост — структурный `{ send, subscribe }`: подойдёт и `@vkma.dev/bridge`, и `@vkontakte/vk-bridge`; жёсткой зависимости нет ни на один.

Импортируй из `/preset`, если пишешь VKUI-приложение: слой реэкспортирует всё снизу. Субпати нижних слоёв нужны, когда ты используешь только часть пакета.

## Аддитивность над TanStack

TanStack — peer-зависимость, и пакет ничего не переизобретает поверх него. Опции маршрутов (`loader`, `beforeLoad`, `validateSearch`, `lazy`, `pendingComponent`, …) проходят в маршруты нетронутыми: всё, что умеет TanStack Router, работает и здесь. Документация TanStack применима к данным и валидации — пакеты [bridge](/bridge/) и router отвечают за другое.

## Поверхность навигации

Всё, чем старый роутер управлял строковыми id, собрано в два инструмента:

- `useNavigator()` — push/replace/back/backToFirst, `showModal`/`showGlobalModal`/`hideModal`, `showPopout`/`hidePopout` и `block`. Хук не подписывается на состояние роутера: нужное читается из живого `router.state` в момент вызова, поэтому использование хука не триггерит ре-рендеры, а объект навигатора стабилен.
- `createVkLink(CellButton)` — превращает любой компонент в типизированную ссылку: цели те же Page-объекты, что принимает `navigator.push`.

Оба принимают хэндлы панелей вместо строк — см. [вьюхи и панели](/router/views-and-panels/).

## Статические дети вместо Outlet

`/vkui` рендерит все панели вьюхи как всегда-смонтированных детей VKUI `View`; роутер только подаёт `activePanel`. Отсюда два следствия, которые выглядят как баги, но являются поведением VKUI:

- направление анимации VKUI выводит из порядка объявления детей — push с пропуском панели назад анимируется как BACK;
- `replace` всё равно анимируется.

Подробнее — в [вьюхах и панелях](/router/views-and-panels/).

## Freeze-семантика data-хуков

Панель остаётся смонтированной во время back-анимации, но её маршрут уже не матчится: сырые TanStack-хуки (`useParams`, `useLoaderData`) кидают `Invariant failed: Could not find an active match` и роняют дерево мимо error boundary роутера. Поэтому используй хуки пакета — `usePanelParams`, `usePanelSearch`, `usePanelLoaderData`: они не бросают и удерживают последнее значение, пока панель смонтирована.

## Дальше

- [Вьюхи и панели](/router/views-and-panels/) — `defineView`, порядок анимаций, лоадеры.
- [Модалки и popout'ы](/router/modals-and-popouts/) — оверлеи как маршруты.
- [История и хост](/router/history/) — режимы URL, `VKWebAppSetLocation`, swipe-back.
- [Миграция](/router/migration/) — со старого `@vkontakte/vk-mini-apps-router`.
