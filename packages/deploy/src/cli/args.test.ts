import { describe, expect, it } from "vitest";
import { parseArgv } from "./args.ts";

describe("parseArgv", () => {
	it("defaults to the deploy command", () => {
		const parsed = parseArgv([]);
		expect(parsed.command).toBe("deploy");
		expect(parsed.errors).toEqual([]);
	});

	it("parses subcommands", () => {
		for (const command of ["login", "logout", "config", "completions"] as const) {
			expect(parseArgv([command]).command).toBe(command);
		}
	});

	it("captures the completions shell argument", () => {
		expect(parseArgv(["completions", "fish"]).shell).toBe("fish");
		expect(parseArgv(["completions"]).shell).toBeUndefined();
	});

	it("parses value flags with space and = forms", () => {
		expect(parseArgv(["--env", "dev"]).values.env).toBe("dev");
		expect(parseArgv(["--env=production"]).values.env).toBe("production");
		expect(parseArgv(["--config", "/tmp/x.json"]).values.config).toBe("/tmp/x.json");
		expect(parseArgv(["--test-group", "qa"]).values.testGroup).toBe("qa");
	});

	it("validates --timeout", () => {
		expect(parseArgv(["--timeout", "30"]).values.timeout).toBe(30);
		const bad = parseArgv(["--timeout", "nope"]);
		expect(bad.errors.length).toBe(1);
		expect(bad.errors[0]).toContain("timeout");
	});

	it("parses --proxy with inline and separate values", () => {
		expect(parseArgv(["--proxy", "http://p:1"]).values.proxy).toBe("http://p:1");
		expect(parseArgv(["--proxy=https://p:2"]).values.proxy).toBe("https://p:2");
		expect(parseArgv(["--proxy"]).errors[0]).toContain("requires a value");
	});

	it("validates --timeout with a round-trip (no silent truncation)", () => {
		expect(parseArgv(["--timeout", "1e3"]).errors.length).toBe(1);
		expect(parseArgv(["--timeout", "30s"]).errors.length).toBe(1);
		expect(parseArgv(["--timeout", " 30 "]).values.timeout).toBe(30);
	});

	it("rejects empty values for value flags (--config= is not discovery)", () => {
		expect(parseArgv(["--config="]).errors[0]).toContain("requires a value");
		expect(parseArgv(["--config", ""]).errors[0]).toContain("requires a value");
	});

	it("rejects value flags without a value", () => {
		const parsed = parseArgv(["--env"]);
		expect(parsed.errors[0]).toContain("requires a value");
	});

	it("parses boolean flags, negations, and shorts", () => {
		const parsed = parseArgv([
			"--dry-run",
			"-v",
			"-q",
			"--json",
			"--no-color",
			"--update-prod",
			"--no-update-dev",
		]);
		expect(parsed.booleans.dryRun).toBe(true);
		expect(parsed.booleans.verbose).toBe(true);
		expect(parsed.booleans.quiet).toBe(true);
		expect(parsed.booleans.json).toBe(true);
		expect(parsed.booleans.noColor).toBe(true);
		expect(parsed.booleans.updateProd).toBe(true);
		expect(parsed.booleans.updateDev).toBe(false);
	});

	it("treats unknown flags and commands as errors", () => {
		expect(parseArgv(["--frobnicate"]).errors[0]).toContain("Unknown flag");
		expect(parseArgv(["explode"]).errors[0]).toContain("Unknown command");
		expect(parseArgv(["deploy", "extra"]).errors[0]).toContain("Unexpected positional");
	});

	it("maps -h and -V", () => {
		expect(parseArgv(["-h"]).booleans.help).toBe(true);
		expect(parseArgv(["-V"]).booleans.version).toBe(true);
	});

	it("flags before a subcommand still imply deploy", () => {
		const parsed = parseArgv(["--dry-run", "login"]);
		expect(parsed.command).toBe("login");
		expect(parsed.booleans.dryRun).toBe(true);
	});
});
