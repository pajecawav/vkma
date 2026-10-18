import { expect, test } from "vitest";
import { hello } from "./index.ts";

test("hello greets with the package name", () => {
	expect(hello("vkma")).toBe("Hello from @vkma.dev/devtools-core, vkma!");
});
