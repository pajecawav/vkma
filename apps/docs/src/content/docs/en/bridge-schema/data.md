---
title: "The catalogue as data"
description: "The /schema and /catalogue subpaths: the raw JSON document, wiring tables and payload stubs."
sidebar:
    order: 2
---

Besides types, the package exports the catalogue as runtime data: a JSON Schema document and wiring tables. Devtools panels, inspectors and validators read these.

## Subpaths

| Subpath      | Exports                     | For                                                       |
| ------------ | --------------------------- | --------------------------------------------------------- |
| `/schema`    | `eventsSchema`, `catalogue` | The full JSON Schema document with `$defs`                |
| `/catalogue` | `catalogue`, `stubs`        | Wiring tables and payload stubs without the heavy `$defs` |

```ts
import { catalogue, eventsSchema } from "@vkma.dev/bridge-schema/schema";

catalogue.props.VKWebAppInit; // "VKWebAppInitProps" — the definition name in $defs
catalogue.events.VKWebAppGetAuthToken; // { result: "VKWebAppAccessTokenReceived", failed: "VKWebAppAccessTokenFailed" }
eventsSchema.$defs.UserInfo; // the payload's JSON Schema node
```

## The document shape

`eventsSchema` is a JSON Schema draft 2020-12 document:

- `$defs` — 270 payload definitions (plain objects, enums, `anyOf` branches);
- `x-vkma-catalogue` — three wiring tables: `props` (96 sendable methods), `receive` (115 receivable names), `events` (94 methods with `Result`/`Failed` wiring).

Table entries reference `$defs` by name. The TypeScript types in the root entrypoint are generated from this same document. Data and types cannot drift apart.

```ts
import type { EventsCatalogue, EventsSchemaDocument } from "@vkma.dev/bridge-schema/schema";

const wiring: EventsCatalogue["events"] = catalogue.events;
const doc: EventsSchemaDocument = eventsSchema;
```

## Validation

`$defs` is a plain JSON Schema document. When data arrives from outside (a log record, a foreign collector), validate it with your validator of choice:

```ts
import { eventsSchema } from "@vkma.dev/bridge-schema/schema";
import { Ajv2020 } from "ajv/dist/2020.js";

const ajv = new Ajv2020();
const validateUserInfo = ajv.compile(eventsSchema.$defs.UserInfo);

if (validateUserInfo(data)) {
    // data conforms to the catalogue's VKWebAppGetUserInfo payload
}
```

## Payload stubs

`stubs` from `/catalogue` maps a method to a minimal object of its required props, precomputed from `$defs` at generation time (required keys only, depth-capped, first branch of any `anyOf`; anything underivable is simply absent):

```ts
import { stubs } from "@vkma.dev/bridge-schema/catalogue";

stubs.VKWebAppStorageGet; // { keys: [] }
stubs.VKWebAppShowWallPostBox; // { attachments: "" }
```

The use case is a "pick a method, get a props skeleton" form: the devtools execute panel and the inspector prefill fields this way, without shipping the whole `$defs` document.

`declare module` augmentation does not affect the data. [`Extending the catalogue`](/en/bridge-schema/extending/) extends types only.
