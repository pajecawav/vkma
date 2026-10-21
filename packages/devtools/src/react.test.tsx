import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Hello } from "./react.tsx";

test("hello renders greeting from the root entry", () => {
	expect(renderToStaticMarkup(<Hello name="vkma" />)).toContain(
		"Hello from @vkma.dev/devtools, vkma!",
	);
});
