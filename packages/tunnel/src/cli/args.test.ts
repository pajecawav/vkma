import { describe, expect, it } from "vitest";
import { parseArgv } from "./args.ts";

describe("parseArgv", () => {
	it("defaults to the run command", () => {
		expect(parseArgv([]).command).toBe("run");
	});

	it("parses value flags with separate and inline values", () => {
		const parsed = parseArgv(["--port", "3000", "--host=0.0.0.0", "--route", "mobile"]);
		expect(parsed.values.port).toBe(3000);
		expect(parsed.values.host).toBe("0.0.0.0");
		expect(parsed.values.route).toBe("mobile");
		expect(parsed.errors).toEqual([]);
	});

	it("round-trip validates --port", () => {
		expect(parseArgv(["--port", "5e3"]).errors[0]).toContain("--port");
		expect(parseArgv(["--port", "0"]).errors[0]).toContain("--port");
		expect(parseArgv(["--port"]).errors[0]).toContain("requires a value");
	});

	it("rejects unknown flags and commands", () => {
		expect(parseArgv(["--wat"]).errors[0]).toContain("Unknown flag");
		expect(parseArgv(["nope"]).errors[0]).toContain("Unknown command");
	});

	it("captures the status positional", () => {
		const parsed = parseArgv(["status", "other-app"]);
		expect(parsed.command).toBe("status");
		expect(parsed.profileArg).toBe("other-app");
	});

	it("rejects extra positionals", () => {
		expect(parseArgv(["run", "extra"]).errors[0]).toContain("Unexpected positional");
	});

	it("maps short flags", () => {
		expect(parseArgv(["-h"]).booleans.help).toBe(true);
		expect(parseArgv(["-V"]).booleans.version).toBe(true);
	});

	it("parses boolean flags", () => {
		const parsed = parseArgv([
			"--qr",
			"--open",
			"--json",
			"--no-color",
			"--all",
			"--no-keepalive",
		]);
		expect(parsed.booleans).toMatchObject({
			qr: true,
			open: true,
			json: true,
			noColor: true,
			all: true,
			noKeepAlive: true,
		});
	});
});
