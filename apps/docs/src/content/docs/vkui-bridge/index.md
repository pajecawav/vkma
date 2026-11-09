---
title: vkui-bridge
description: "React-клей между мостом и VKUI: тема, insets и адаптивность хоста в одном провайдере."
sidebar:
    order: 0
    label: "Описание"
---

`@vkma.dev/vkui-bridge` — React-клей между [`@vkma.dev/bridge`](/bridge/) и [`@vkontakte/vkui`](https://github.com/VKCOM/VKUI). Провайдер стримит тему хоста, safe-area insets и адаптивность из событий моста в готовую оболочку `ConfigProvider`. Семантика скопирована с [`@vkontakte/vk-bridge-react`](https://www.npmjs.com/package/@vkontakte/vk-bridge-react).

```sh
npm install @vkma.dev/vkui-bridge
# peers: @vkma.dev/bridge ^0.2.0, @vkontakte/vkui ^8.0.0, react ^18 | ^19
```

## Использование

`main.tsx` мини-аппа:

```tsx
import bridge from "@vkma.dev/bridge";
import { VKBridgeConfigProvider } from "@vkma.dev/vkui-bridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@vkontakte/vkui/dist/vkui.css";

// Сообщаем хосту, что приложение готово: сворачивается прелоадер, включается история.
void bridge.send("VKWebAppInit");

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <VKBridgeConfigProvider>
            <App />
        </VKBridgeConfigProvider>
    </StrictMode>,
);
```

`VKBridgeConfigProvider` собирает `ConfigProvider` → `AdaptivityProvider` → `AppRoot(mode="full")` с вычисленными от моста дефолтами:

| Проп ConfigProvider         | Источник                                                                         |
| --------------------------- | -------------------------------------------------------------------------------- |
| `colorScheme`               | `VKWebAppUpdateConfig` плюс бутстрап `VKWebAppGetConfig` (`useBridgeAppearance`) |
| `platform`                  | `"vkcom"`, если `vk_platform === "desktop_web"` в launch params                  |
| `isWebView`                 | `bridge.isWebView()`                                                             |
| `hasCustomPanelHeaderAfter` | всегда `true` — угол PanelHeader резервится под контролы хоста                   |
| пропсы `AdaptivityProvider` | адаптивность хоста через `transformVKBridgeAdaptivity(useBridgeAdaptivity())`    |
| `AppRoot.safeAreaInsets`    | `VKWebAppUpdateInsets` и insets конфига через `useBridgeInsets`                  |

Пропс, переданный явно, побеждает вычисленное значение: провайдер принимает всю поверхность пропсов `ConfigProvider` и раскладывает её последним.

## Хуки

Каждый хук читает дефолтный инстанс моста.

- **`useBridgeAppearance()`** — `ColorSchemeType | undefined`. Стримит `VKWebAppUpdateConfig`, бутстрапится `VKWebAppGetConfig`. Вне мини-аппа возвращает `undefined` — тему определяет сам VKUI.
- **`useBridgeInsets()`** — `SafeAreaInsets | undefined`. Читает `VKWebAppUpdateInsets` и поле insets конфига. `bottom` больше 150 обнуляется — кламп виртуальной клавиатуры.
- **`useBridgeAdaptivity()`** — `{ type, viewportWidth, viewportHeight }`. `type` — вердикт хоста (`adaptive`, `force_mobile`, `force_mobile_compact` или `null`) плюс viewport на момент изменения.

## Ссылки

- [npm: @vkma.dev/vkui-bridge](https://www.npmjs.com/package/@vkma.dev/vkui-bridge)

## Разделы

- [Хуки](/vkui-bridge/hooks/) — сигнатуры и границы трёх хуков.
- [Провайдер](/vkui-bridge/provider/) — `VKBridgeConfigProvider` и перекрытия.
