# @vkma.dev/devtools

Devtools for VK Mini Apps.

```ts
import { hello } from "@vkma.dev/devtools";

hello("vkma"); // "Hello from @vkma.dev/devtools, vkma!"
```

React bindings live under the `./react` subpath (optional peer dependency:
`react ^18 || ^19`):

```tsx
import { Hello } from "@vkma.dev/devtools/react";

<Hello name="vkma" />; // <h1>Hello from @vkma.dev/devtools, vkma!</h1>
```
