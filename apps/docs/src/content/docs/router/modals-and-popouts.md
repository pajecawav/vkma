---
title: "Модалки и popout'ы роутера: оверлеи как маршруты"
description: "Оверлеи как маршруты: showModal, useModalProps и последовательная хореография."
sidebar:
    order: 3
    label: "Модалки и popout'ы"
---

Модалка — не команда поверх истории, а дочерний маршрут своей панели. Открытая модалка видна в URL, переживает перезагрузку, закрывается системным «назад» и восстанавливается глубокой ссылкой.

## Объявление

Модалки объявляются в опциях панели, которой они принадлежат:

```tsx
export const meetingPanel = plansView.panel(
    "meeting/$id",
    {
        modals: {
            edit: lazy(() => import("./edit.ui")),
            share: lazy(() => import("./share.ui")),
            attendees: {
                component: lazy(() => import("./attendees.ui")),
                modals: { invite: lazy(() => import("./invite.ui")) }, // вложенные
            },
        },
        popouts: { delete: DeleteMeetingPopout },
    },
    () => import("./meeting.ui"),
);
```

Запись `{ component, modals }` делает вложенные модалки дочерними маршрутами самой модалки. Объявление рекурсивно. Шаги цепочки — сиблинги-маршруты панели.

Передай `routeMasks` в роутер, иначе открытие модалки положит её путь в адресную строку:

```ts
export const router = createRouter({
    routeTree: app.routeTree,
    routeMasks: app.routeMasks, // маски: URL остаётся на панели
    // …
});
```

## Компонент модалки

Хост владеет навигацией и хореографией; компонент рендерит собственную поверхность:

```tsx
import { ModalCardSurface, useModalProps, useNavigator } from "@vkma.dev/router/preset";

export default function ShareMeetingCard(): ReactElement {
    const { note } = useModalProps<{ note?: string }>() ?? {};
    const navigator = useNavigator();

    return (
        <ModalCardSurface
            title="Поделиться встречей"
            description={note ?? "Выберите получателя"}
            actions={/* … */}
        />
    );
}
```

`ModalPageSurface` и `ModalCardSurface` принимают хедер, размер и хром как обычные пропсы. Содержимое модалки контекстуально, а не декларативно. Панельные хуки (`usePanelParams(meetingPanel)`) работают и внутри модалки: она читает параметры панели-владельца.

## Открытие и props

```tsx
const navigator = useNavigator();

void navigator.showModal({ to: "/meeting/$id/edit", params: { id }, props: { note: "…" } });
navigator.hideModal();
```

`props` должны быть сериализуемыми (structured clone): они едут в `history.state` и читаются через `useModalProps()`. Props переживают перезагрузку и back/forward. Уходящая модалка удерживает последние props, пока анимируется наружу.

Глобальная модалка открывается с любой панели и адресуется через `?modal=<id>`:

```tsx
void navigator.showGlobalModal("create", { props: { prefill: "…" } });
```

Обяви её в `createApp({ modals: { create: CreateMeetingModal } })`. URL маскируется обратно до пути панели, поэтому глубокая ссылка `?modal=create` тоже работает. `hideModal()` на первой записи истории (модалка по глубокой ссылке) заменяет запись на панель.

## Хореография

Два правила, которые хост гарантирует:

- **Сиблинги заменяют запись.** Переход модалка → модалка одной панели делает replace. Стека модалок нет, «назад» возвращает на панель (parity старого роутера).
- **Вложенные делают push.** Цель, путь которой начинается с `fullPath` открытой модалки, пушится: back отматывает ровно один уровень перед показом родителя.

Каждая смена цели последовательна: старый лист получает `open=false`, его `onClosed` завершает выход, и только потом цель получает `open=true`. Двух открытых листов не бывает. Повторный таргетинг во время выхода отменяет выход (VKUI разворачивает переход на лету).

Глубокая ссылка во вложенную модалку разворачивает всю цепочку предков, панель плюс каждый уровень снаружи внутрь, чтобы back шёл по естественному стеку.

## Popout'ы

Popout — транзиентный оверлей без маршрута: `ScreenSpinner`, `Alert`. Идентификатор и сериализуемые props пишутся в `history.state`, компоненты берутся из реестров: сначала реестр текущей панели (`PanelOptions.popouts`), затем глобальный `createApp({ popouts })`. Коллизия id между ними — dev-time console error.

```tsx
void navigator.showPopout("delete", { id: "m1" });
navigator.hidePopout();
```

Хост инжектит `onClose`. Прокинь его в `onClosed` VKUI-компонента:

```tsx
export function DeleteMeetingPopout({ id, onClose }: { id?: string; onClose: () => void }) {
    return (
        <Alert
            onClosed={onClose}
            actions={[
                {
                    title: "Удалить",
                    action: () => {
                        /* … */ onClose();
                    },
                },
            ]}
        />
    );
}
```

Back закрывает popout, back/forward восстанавливает его props. В history state пишутся только id и данные, никогда не React-элементы.

Режимы URL и синхронизация с хостом описаны в [истории](/router/history/).
