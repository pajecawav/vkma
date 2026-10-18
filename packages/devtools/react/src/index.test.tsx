import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Hello } from "./index.tsx";

test("hello renders greeting from devtools-core", () => {
	expect(renderToStaticMarkup(<Hello name="vkma" />)).toContain(
		"Hello from @vkma.dev/devtools-core, vkma!",
	);
});
