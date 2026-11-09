---
title: "Вьюхи и панели"
description: "defineView и definePanel: типизированные хэндлы, порядок анимаций и владение «/»."
sidebar:
    order: 2
---

Панель объявляется один раз и становится типизированным хэндлом: через него navigate проверяет params, а хуки выводят типы search и loaderData. Строковые id не нужны.

## Хаб вьюхи

```tsx
// panels/plans/plans.panel.tsx — единственное место, где написан ключ "plans"
import { defineView } from "@vkma.dev/router/preset";

export const plansView = defineView("plans");

export const plansPanel = plansView.panel(
    "index",
    {
        validateSearch: (search: Record<string, unknown>): PlansSearch => ({/* … */}),
        loader: async () => ({ ready: true }),
        staleTime: 30_000,
    },
    () => import("./plans.ui"),
);

export const meetingPanel = plansView.panel("meeting/$id", {/* … */}, () => import("./meeting.ui"));
```

`defineView("plans")` создаёт хаб: единственное место, где пишется ключ вьюхи. `plansView.panel(path, options, lazy?)` — вид-скопированный `definePanel`: создаёт определение и регистрирует его в порядке вызова.

Порядок объявления — это порядок JSX-детей VKUI `View`, то есть направление push/pop-анимации. Объявляй панели в логике навигации: `index`, потом `meeting/$id` — переход между ними анимируется вперёд.

Три правила каталога на вьюху:

- `panels/<view>/<view>.panel.ts(x)` — хаб; имя файла гарантирует, что он сортируется раньше чанков (это важно для проверки типов).
- `<name>.ui.tsx` — UI-чанки; компонент — default export с аннотацией: `export default function PlansPanel(): ReactElement`.
- Приватные модалки — `lazy(() => import("./edit.ui"))` внутри опций панели; чанк тоже default-экспортирует компонент.

Чанки импортируют хаб (не `app.tsx`), поэтому циклических зависимостей не возникает. Дубликат ключа вьюхи или пути панели — dev-time console error.

`lazy` — отдельный третий параметр, а не член `options`: стрелка загрузки внутри inferred-типа опций зацикливает вывод типов (TS7022).

## Типы из опций

Определение панели — и есть хэндл. Фантомный `types` выводится из её же опций:

- сегменты `$param` в пути → тип `params` (`"meeting/$id"` → `{ id: string }`);
- возврат `validateSearch` → тип search;
- возврат `loader` → тип loaderData.

Путь `"index"` владеет `/`. Пути панелей глобальны: две вьюхи с `index` конфликтуют (матчер выберет произвольную), `createApp` ругнётся в консоль на дубликаты. Домашняя панель каждой следующей вьюхи получает свой сегмент: `plans`, `invitations`, `profile`.

## Приложение

```tsx
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";

export const app = createApp({
    root: AppShell, // или готовый AppRootShell
    views: [plansView, invitationsView, profileView],
    modals: { settings: SettingsModal },
    popouts: { reset: ResetPopout },
});

export const router = createRouter({
    routeTree: app.routeTree,
    routeMasks: app.routeMasks,
    history: createVkHistory({ mode: "hash" }).history,
    defaultNotFoundComponent: NotFound,
});
```

`root` получает `{ app }` плюс сырые пропсы матча. Дефолтный `AppRootShell` сам собирает шелл; свой шелл с Epic/Tabbar компонуй из деталей:

```tsx
export function AppShell({ app }: { app: AppHandle }) {
    useInflate(app);                        // разворачивание цепочки панелей по глубокой ссылке
    const activeStory = useActiveStory(app);
    return (
        <>
            <Epic activeStory={activeStory} tabbar={/* … */}>
                {Object.values(app.views).map(view => (
                    <VkView key={view.id} view={view} nav={storyKeyOf(view.id)} />
                ))}
            </Epic>
            <Modals entries={app.modals} />
            <Popouts entries={app.popouts} />
        </>
    );
}
```

Передавай `nav` явно: Epic ищет детей по `getNavId` в пропсах элемента, а внутренний дефолт `VkView` недостижим для этой проверки. Значение — ключ вьюхи, тот же, что возвращает `useActiveStory`, поэтому сравнение `activeStory === tab.id` работает на пользовательских ключах.

## Данные и навигация в панели

```tsx
export default function MeetingPanel(): ReactElement {
    const { id } = usePanelParams(meetingPanel);
    const search = usePanelSearch(meetingPanel);
    const data = usePanelLoaderData(plansPanel);
    const navigator = useNavigator();

    return (
        <PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />} />
        // …
    );
}
```

Передавай хукам сам хэндл панели — типы params/search/loaderData выводятся автоматически. Хуки не бросают во время back-анимации (freeze-семантика, см. [концепции](/router/concepts/)).

Ссылки из любых компонентов — через `createVkLink`:

```tsx
const CellButtonLink = createVkLink(CellButton);

<CellButtonLink page={meetingPanel} params={{ id: "1" }}>
    Открыть
</CellButtonLink>;
```

`preload="intent"` по умолчанию: чанк и loaderData подгружаются на hover/focus/touchstart — до тапа. Оверлеи — в [модалках и popout'ах](/router/modals-and-popouts/), режимы URL — в [истории](/router/history/).
