# @vkma.dev/bridge-schema

JSON Schema catalogue of every VK Bridge event — method request props, response/receive data and the `Result`/`Failed` event wiring — with generated TypeScript types on top.

Typed after the VK Bridge event catalogue. Thanks to [VKCOM/vk-bridge](https://github.com/VKCOM/vk-bridge) (MIT) for the reference catalogue.

## Install

```sh
pnpm add @vkma.dev/bridge-schema
```

## Types

The root entrypoint exports the payload types plus the three catalogue maps:

- `RequestPropsMap` — request props of every sendable method
- `ReceiveDataMap` — data of every receivable event
- `ReceiveEventMap` — wiring of a method to its `Result`/`Failed` event names

```ts
import type { RequestPropsMap, UserInfo } from "@vkma.dev/bridge-schema";

type InitProps = RequestPropsMap["VKWebAppInit"];
```


## Extending the catalogue

The maps are declared as `interface`s in the package root specifically so that **declaration merging** works: add your own (or your backend's proxy) events without forking anything.

```ts
declare module "@vkma.dev/bridge-schema" {
    interface RequestPropsMap {
        VKWebAppMyCustomMethod: { foo: string };
    }
    interface ReceiveDataMap {
        VKWebAppMyCustomMethodResult: { bar: number };
        VKWebAppMyCustomMethodFailed: { error_type: string };
    }
    interface ReceiveEventMap {
        VKWebAppMyCustomMethod: {
            result: "VKWebAppMyCustomMethodResult";
            failed: "VKWebAppMyCustomMethodFailed";
        };
    }
}
```

After this, `send("VKWebAppMyCustomMethod", { foo: "x" })` is fully typed through `@vkma.dev/bridge` (which resolves response types via these maps).

Two rules of the road:

- **The augmentation target must be `@vkma.dev/bridge-schema`** — merging only applies to the module that declares the interfaces; re-exports don't merge.
- **Extend only.** TS interface merging cannot alter existing members; fixes to the built-in catalogue ship as schema releases.

## The catalogue as data

`@vkma.dev/bridge-schema/schema` exports the raw document for runtime consumers — devtools panels, inspectors, validators:

```ts
import { catalogue, eventsSchema } from "@vkma.dev/bridge-schema/schema";

catalogue.props.VKWebAppInit; // "VKWebAppInitProps"
catalogue.events.VKWebAppGetAuthToken; // { result: "VKWebAppAccessTokenReceived", failed: "VKWebAppAccessTokenFailed" }
eventsSchema.$defs.UserInfo; // the JSON Schema node
```

`$defs` is a plain JSON Schema document — point your validator (AJV etc.) straight at `eventsSchema`.

## License

MIT.
