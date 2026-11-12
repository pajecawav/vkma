---
title: "VKBridgeConfigProvider: композиция и перекрытия"
description: "VKBridgeConfigProvider: вычисленные дефолты, перекрытие пропсами и порядок композиции."
sidebar:
    order: 2
    label: "Провайдер"
---

`VKBridgeConfigProvider` — собранная VKUI-оболочка мини-аппа: три провайдера VKUI с дефолтами, вычисленными из моста. Оборачивает приложение целиком, внутри `StrictMode` и снаружи корневого компонента.

## Композиция

```tsx
<VKBridgeConfigProvider>
    <App />
</VKBridgeConfigProvider>
```

Внутри провайдер рендерит:

```tsx
<ConfigProvider /* мостовые дефолты + твои перекрытия */>
    <AdaptivityProvider /* transformVKBridgeAdaptivity(useBridgeAdaptivity()) */>
        <AppRoot mode="full" safeAreaInsets={insets}>
            {children}
        </AppRoot>
    </AdaptivityProvider>
</ConfigProvider>
```

Порядок зафиксирован: `ConfigProvider` → `AdaptivityProvider` → `AppRoot`. `AppRoot` идёт с `mode="full"`. Приложение живёт не в виджете, а на всём экране хоста.

## Что вычисляется

| Проп ConfigProvider         | Источник                                                                      |
| --------------------------- | ----------------------------------------------------------------------------- |
| `colorScheme`               | `VKWebAppUpdateConfig` + бутстрап `VKWebAppGetConfig` (`useBridgeAppearance`) |
| `platform`                  | `"vkcom"`, если `vk_platform === "desktop_web"` в launch params               |
| `isWebView`                 | `bridge.isWebView()`                                                          |
| `hasCustomPanelHeaderAfter` | всегда `true` — угол PanelHeader резервится под контролы хоста                |
| пропсы `AdaptivityProvider` | `transformVKBridgeAdaptivity(useBridgeAdaptivity())`                          |
| `AppRoot.safeAreaInsets`    | `VKWebAppUpdateInsets` и insets конфига через `useBridgeInsets`               |

Логика каждого источника описана в [хуках](/vkui-bridge/hooks/). Провайдер просто собирает их в одно дерево.

## Перекрытие

Пропсы провайдера — вся поверхность `Partial<ConfigProviderProps>` плюс `children`. Явно переданный пропс побеждает вычисленное значение: провайдер раскладывает перекрытия последним, после мостовых дефолтов.

```tsx
// зафиксировать тему независимо от хоста
<VKBridgeConfigProvider colorScheme="dark">
    <App />
</VKBridgeConfigProvider>
```

Типичное применение: форс темы для вью «настроек», отладочная платформа, `locale`. Если ничего не передано, работают мостовые дефолты.

## Границы

- `platform` вычисляется только для `desktop_web`; на остальных платформах остаётся `undefined`, и VKUI берёт платформу из собственных эвристик.
- `useBridgeAppearance` вне песочницы возвращает `undefined` (см. [хуки](/vkui-bridge/hooks/)). В обычном браузере тему определяет VKUI, если ты не передал `colorScheme` явно.
- Вне мини-аппа бутстрап-запрос конфига завершается ошибкой: она попадает в консоль, но не затрагивает приложение.
