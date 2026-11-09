---
title: "Хуки"
description: "useBridgeAppearance, useBridgeInsets, useBridgeAdaptivity: сигнатуры и границы."
sidebar:
    order: 1
---

Три хука стримят решение хоста — тему, safe-area insets и адаптивность — из событий моста. Семантика 1:1 с `@vkontakte/vk-bridge-react`. Каждый хук читает дефолтный инстанс `@vkma.dev/bridge`.

## useBridgeAppearance

```ts
function useBridgeAppearance(): ColorSchemeType | undefined;
```

Тема хоста: стримится из `VKWebAppUpdateConfig` и бутстрапится запросом `VKWebAppGetConfig`. Возврат — `ColorSchemeType` (`"light"` | `"dark"`) или `undefined`.

Вне мини-аппа хук возвращает `undefined` — тему определяет сам VKUI. Легаси-схемы `space_gray` и `vkcom_dark` возвращаются как `"dark"`, остальные — как `"light"`.

## useBridgeInsets

```ts
function useBridgeInsets(): SafeAreaInsets | undefined;
```

Safe-area insets для `AppRoot.safeAreaInsets`. Читает события `VKWebAppUpdateInsets` и поле `insets` конфига. Вне мини-аппа возвращает `undefined` — VKUI сам решает, что делать с отсутствием.

`bottom` больше 150 обнуляется: без клампа виртуальная клавиатура попадала бы в safe-area при каждом фокусе поля ввода.

## useBridgeAdaptivity

```ts
interface BridgeAdaptivity {
    type: "adaptive" | "force_mobile" | "force_mobile_compact" | null;
    viewportWidth: number;
    viewportHeight: number;
}

function useBridgeAdaptivity(): BridgeAdaptivity;
```

Вердикт адаптивности хоста: стримится из `VKWebAppUpdateConfig`, бутстрапится `VKWebAppGetConfig`, удерживает последние полученные значения.

Неизвестная директива адаптивности становится `null`, не-числовые viewport — `0`.

Для `AdaptivityProvider` пропусти значение через трансформер:

```ts
import { transformVKBridgeAdaptivity } from "@vkma.dev/vkui-bridge";

const adaptivityProps = transformVKBridgeAdaptivity(useBridgeAdaptivity());
```

## Чистые резолверы

Логика хуков экспортирована отдельно — для тестов и не-React потребителей:

- `resolveAppearance(data)` — `BridgeConfigData` → тема, с легаси-маппингом схем;
- `resolveAdaptivity(data)` — директива → `BridgeAdaptivity` (неизвестные в `null`);
- `resolveInsets(event)` — оба источника insets с клампом клавиатуры;
- `transformVKBridgeAdaptivity(adaptivity)` — словарь моста → пропсы `AdaptivityProvider`.

Общий тип пейлоада — `BridgeConfigData` (пересечение полей `VKWebAppUpdateConfig`, результата `VKWebAppGetConfig` и `VKWebAppUpdateInsets`): `scheme`, `appearance`, `insets`, `adaptivity`, `viewport_width`, `viewport_height` — все опциональные, хосты разных платформ присылают разные наборы.

Собранный провайдер из этих хуков — в [провайдере](/vkui-bridge/provider/).
