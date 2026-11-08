---
title: "Хуки"
description: "useBridgeAppearance, useBridgeInsets, useBridgeAdaptivity: сигнатуры и границы."
sidebar:
    order: 1
---

Три хука стримят решение хоста — тему, safe-area insets и адаптивность — из событий моста. Семантика 1:1 с `@vkontakte/vk-bridge-react`. Каждый хук читает дефолтный синглтон `@vkma.dev/bridge` и подписывается изоморфным layout-эффектом.

## useBridgeAppearance

```ts
function useBridgeAppearance(): ColorSchemeType | undefined;
```

Тема хоста: стримится из `VKWebAppUpdateConfig` и бутстрапится запросом `VKWebAppGetConfig`. Возврат — `ColorSchemeType` (`"light"` | `"dark"`) или `undefined`.

Границы:

- Хук инертен вне песочницы: пока `bridge.isEmbedded()` ложен, подписки нет. В обычном браузере возвращается `undefined`, и VKUI падает на собственную системную детекцию темы.
- Событие учитывается, только если несёт оба ключа — и `appearance`, и `scheme`.

Разрешение значения: современное поле `appearance` побеждает; легаси-схемы `space_gray` и `vkcom_dark` маппятся в `"dark"`, всё остальное — `"light"`.

## useBridgeInsets

```ts
function useBridgeInsets(): SafeAreaInsets | undefined;
```

Safe-area insets для `AppRoot.safeAreaInsets`. Читает два источника: события `VKWebAppUpdateInsets` и поле `insets` конфиг-пейлоадов. В отличие от appearance, гейта embed нет — VKUI сам решает, что делать с отсутствием.

Граница — кламп виртуальной клавиатуры: `bottom` больше 150 обнуляется. Значение 150 — потолок высоты транзиентной клавиатуры; без клампа layout вбирал бы её в safe-area при каждом фокусе поля ввода.

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

Граница продвижения: состояние двигается только у событий, несущих одновременно `viewport_width` и `viewport_height` — конфиги с одной стороной viewport игнорируются. Неизвестная директива становится `null`, не-числовые viewport — `0`.

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
