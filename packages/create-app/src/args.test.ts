import { describe, expect, it } from "vitest";
import { ArgsError, parseArgs } from "./args.ts";

describe("parseArgs", () => {
	it("defaults: no target, install and git on", () => {
		expect(parseArgs([])).toEqual({
			targetDir: null,
			preset: undefined,
			pm: undefined,
			install: true,
			git: true,
			help: false,
		});
	});

	it("positional target", () => {
		expect(parseArgs(["my-app"]).targetDir).toBe("my-app");
	});

	it("flags with space and = values", () => {
		const args = parseArgs(["my-app", "--preset", "vkui", "--pm=bun"]);
		expect(args.targetDir).toBe("my-app");
		expect(args.preset).toBe("vkui");
		expect(args.pm).toBe("bun");
	});

	it("opt-outs", () => {
		const args = parseArgs(["--no-install", "--no-git"]);
		expect(args.install).toBe(false);
		expect(args.git).toBe(false);
	});

	it("help aliases", () => {
		expect(parseArgs(["-h"]).help).toBe(true);
		expect(parseArgs(["--help"]).help).toBe(true);
	});

	it("ignores everything after --", () => {
		const args = parseArgs(["app", "--", "--preset", "nope"]);
		expect(args.preset).toBeUndefined();
	});

	it("rejects unknown flags", () => {
		expect(() => parseArgs(["--wat"])).toThrow(ArgsError);
	});

	it("rejects a second positional", () => {
		expect(() => parseArgs(["a", "b"])).toThrow(ArgsError);
	});

	it("rejects valueless --preset", () => {
		expect(() => parseArgs(["--preset"])).toThrow(ArgsError);
		expect(() => parseArgs(["--preset", "--no-git"])).toThrow(ArgsError);
	});
});
