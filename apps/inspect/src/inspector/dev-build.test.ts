// @vitest-environment node
// The dev build has one non-obvious invariant: it must be all-in-one. The
// inspector entry has no HTML to carry its initial chunks, so under any
// chunk-splitting strategy its <script src> waits forever for files nothing
// loads, and the snippet from a dev panel never starts. The production
// passes are covered by artifact.test.ts.
import { expect, it } from "vitest";
import devConfig from "../../rsbuild.dev.config.ts";

it("the dev build is all-in-one, so the dev inspector.js starts on its own", () => {
	// the premise: nothing but the script tag brings this entry to life
	expect(devConfig.source?.entry?.inspector).toEqual({
		import: "./src/inspector/index.ts",
		html: false,
	});
	expect(devConfig.performance?.chunkSplit?.strategy).toBe("all-in-one");
});
