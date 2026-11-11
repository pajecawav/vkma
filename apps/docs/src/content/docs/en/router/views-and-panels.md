---
title: "Views and panels"
description: 'defineView and definePanel: typed handles, animation order, and owning "/".'
sidebar:
    order: 2
---

A panel is declared once and becomes a typed handle: navigation type-checks params through it, and hooks derive search and loaderData types from it. No string ids.

## The view hub

```tsx
// panels/plans/plans.panel.tsx — the one place the "plans" view key is written
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

`defineView("plans")` creates a hub: the single place the view key is written. `plansView.panel(path, options, lazy?)` is the view-scoped `definePanel`. It creates the definition and registers it in call order.

The declaration order is the JSX children order of the VKUI `View`, i.e. the push/pop animation direction. Declare panels in navigation logic: `index`, then `meeting/$id`. The transition between them animates forward.

Three directory rules per view:

- `panels/<view>/<view>.panel.ts(x)` — the hub; the file name guarantees it sorts before its chunks (this matters for type checking).
- `<name>.ui.tsx` — UI chunks; the component is a default export with an annotation: `export default function PlansPanel(): ReactElement`.
- Private modals — `lazy(() => import("./edit.ui"))` inside the panel options; the chunk default-exports its component too.

Chunks import the hub (never `app.tsx`), so no import cycles arise. A duplicate view key or panel path is a dev-time console error.

`lazy` is a separate third parameter, not an `options` member: a load arrow inside the inferred options type loops type inference (TS7022).

## Types from options

The panel definition is the handle. Its phantom `types` derive from the panel's own options:

- `$param` path segments → the `params` type (`"meeting/$id"` → `{ id: string }`);
- the `validateSearch` return → the search type;
- the `loader` return → the loaderData type.

The path `"index"` owns `/`. Panel paths are global: two views with an `index` conflict (matching picks arbitrarily), and `createApp` console-errors on duplicates. Every other view's home panel gets a distinct segment: `plans`, `invitations`, `profile`.

## The app

```tsx
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";

export const app = createApp({
    root: AppShell, // or the ready-made AppRootShell
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

`root` receives `{ app }` plus the raw match props. The default `AppRootShell` assembles the shell on its own; compose a custom Epic/Tabbar shell from the parts:

```tsx
export function AppShell({ app }: { app: AppHandle }) {
    useInflate(app);                        // replays the panel chain on a deep link
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

Pass `nav` explicitly: Epic matches children by `getNavId` over the element props, and `VkView`'s internal default sits one level below that inspection. The value is the view key, the same key `useActiveStory` returns, so `activeStory === tab.id` compares user-authored keys on both sides.

## Data and navigation inside a panel

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

Pass the panel handle itself to the hooks. Params/search/loaderData types come out automatically. The hooks never throw during the back animation (freeze semantics, see [concepts](/en/router/concepts/)).

Links out of any component go through `createVkLink`:

```tsx
const CellButtonLink = createVkLink(CellButton);

<CellButtonLink page={meetingPanel} params={{ id: "1" }}>
    Open
</CellButtonLink>;
```

`preload="intent"` by default: the chunk and loader data are fetched on hover/focus/touchstart, before the tap. Overlays live in [modals and popouts](/en/router/modals-and-popouts/), URL modes in [history](/en/router/history/).
