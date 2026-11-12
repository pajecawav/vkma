---
title: "Modals and popouts as routes"
description: "Overlays as routes: showModal, useModalProps, and sequential choreography."
sidebar:
    order: 3
    label: "Modals and popouts"
---

A modal is not a command on top of the history. It is a child route of its panel. An open modal is visible in the URL, survives a reload, closes on the system back and is restored by a deep link.

## Declaration

Modals are declared in the options of the panel that owns them:

```tsx
export const meetingPanel = plansView.panel(
    "meeting/$id",
    {
        modals: {
            edit: lazy(() => import("./edit.ui")),
            share: lazy(() => import("./share.ui")),
            attendees: {
                component: lazy(() => import("./attendees.ui")),
                modals: { invite: lazy(() => import("./invite.ui")) }, // nested
            },
        },
        popouts: { delete: DeleteMeetingPopout },
    },
    () => import("./meeting.ui"),
);
```

A `{ component, modals }` entry makes the nested modals child routes of that modal. The declaration is recursive. Chain steps are sibling routes of the panel.

Pass `routeMasks` into the router, or opening a modal puts its own path in the address bar:

```ts
export const router = createRouter({
    routeTree: app.routeTree,
    routeMasks: app.routeMasks, // masks: the URL stays at the panel
    // …
});
```

## The modal component

The host owns navigation and choreography; the component renders its own surface:

```tsx
import { ModalCardSurface, useModalProps, useNavigator } from "@vkma.dev/router/preset";

export default function ShareMeetingCard(): ReactElement {
    const { note } = useModalProps<{ note?: string }>() ?? {};
    const navigator = useNavigator();

    return (
        <ModalCardSurface
            title="Share the meeting"
            description={note ?? "Pick a recipient"}
            actions={/* … */}
        />
    );
}
```

`ModalPageSurface` and `ModalCardSurface` take header, size and chrome as ordinary runtime props. Modal content is contextual, not declarative. Panel hooks (`usePanelParams(meetingPanel)`) work inside a modal too: it reads the owning panel's params.

## Opening and props

```tsx
const navigator = useNavigator();

void navigator.showModal({ to: "/meeting/$id/edit", params: { id }, props: { note: "…" } });
navigator.hideModal();
```

`props` must be serializable (structured clone): they ride in `history.state` and are read with `useModalProps()`. They survive reloads and back/forward. A departing modal retains its last props while it animates out.

A global modal opens from any panel and is addressed via `?modal=<id>`:

```tsx
void navigator.showGlobalModal("create", { props: { prefill: "…" } });
```

Declare it in `createApp({ modals: { create: CreateMeetingModal } })`. The URL is masked back to the panel path, so a `?modal=create` deep link works too. `hideModal()` on the first history entry (a deep-linked modal) replaces the entry with the panel.

## Choreography

Two rules the host guarantees:

- **Siblings replace the entry.** A modal → modal transition within one panel replaces. There is no modal stack, and back returns to the panel (old-router parity).
- **Nested modals push.** A target whose path starts with the open modal's `fullPath` is pushed: back unwinds exactly one level before revealing the parent.

Every retarget is sequential: the old sheet gets `open=false`, its `onClosed` completes the exit, and only then the target gets `open=true`. There are never two open sheets. Re-targeting while a sheet exits cancels the exit (VKUI reverses the transition mid-flight).

A deep link into a nested modal inflates the full ancestor chain, the panel plus every modal level from outer to inner, so back walks the natural stack.

## Popouts

A popout is a transient overlay without a route: `ScreenSpinner`, `Alert`. The id and serializable props land in `history.state`, components come from the registries: the current panel's own registry (`PanelOptions.popouts`) first, then the global `createApp({ popouts })`. An id collision between them is a dev-time console error.

```tsx
void navigator.showPopout("delete", { id: "m1" });
navigator.hidePopout();
```

The host injects `onClose`. Wire it into your VKUI component's `onClosed`:

```tsx
export function DeleteMeetingPopout({ id, onClose }: { id?: string; onClose: () => void }) {
    return (
        <Alert
            onClosed={onClose}
            actions={[
                {
                    title: "Delete",
                    action: () => {
                        /* … */ onClose();
                    },
                },
            ]}
        />
    );
}
```

Back closes the popout; back/forward restores its props. Only ids and data go into history state, never React elements.

URL modes and host sync are covered in [history](/en/router/history/).
