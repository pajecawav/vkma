import { describe, expect, it } from "vitest";
import { parseArgv } from "./args.ts";

describe("parseArgv", () => {
	it("defaults to the run command", () => {
		expect(parseArgv([]).command).toBe("run");
	});

	it("parses value flags with separate and inline values", () => {
		const parsed = parseArgv([
			"--port",
			"3000",
			"--host=0.0.0.0",
			"--opentunnel-route",
			"mobile",
			"--opentunnel-api=https://opentunnel.example",
		]);
		expect(parsed.values.port).toBe(3000);
		expect(parsed.values.host).toBe("0.0.0.0");
		expect(parsed.values.opentunnel).toEqual({
			route: "mobile",
			api: "https://opentunnel.example",
		});
		expect(parsed.errors).toEqual([]);
	});

	it("scopes a provider's flags to its own section", () => {
		const parsed = parseArgv(["--cloudflared-mode=token", "--opentunnel-route", "mobile"]);
		expect(parsed.values.opentunnel).toEqual({ route: "mobile" });
		expect(parsed.values.cloudflared).toEqual({ mode: "token" });
		// A section appears only when one of its flags was passed.
		expect(parseArgv(["--port", "3000"]).values.opentunnel).toBeUndefined();
		expect(parseArgv(["--port", "3000"]).values.cloudflared).toBeUndefined();
	});

	it("no longer knows the unprefixed --route and --api", () => {
		// They looked as if they applied to every provider; opentunnel's
		// options carry its prefix now, like cloudflared's.
		expect(parseArgv(["--route", "mobile"]).errors[0]).toContain("Unknown flag");
		expect(parseArgv(["--api", "https://opentunnel.example"]).errors[0]).toContain(
			"Unknown flag",
		);
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

	it("parses the --cloudflared-* flags into the config section's keys", () => {
		const parsed = parseArgv([
			"--provider",
			"cloudflared",
			"--cloudflared-mode=token",
			"--cloudflared-hostname",
			"app.example.com",
			"--cloudflared-protocol",
			"http2",
			"--cloudflared-binary",
			"/opt/cloudflared",
		]);
		expect(parsed.errors).toEqual([]);
		expect(parsed.values.provider).toBe("cloudflared");
		expect(parsed.values.cloudflared).toEqual({
			mode: "token",
			hostname: "app.example.com",
			protocol: "http2",
			binary: "/opt/cloudflared",
		});
	});

	it("leaves the cloudflared section absent when no such flag was passed", () => {
		expect(parseArgv(["--provider", "cloudflared"]).values.cloudflared).toBeUndefined();
	});

	it("rejects an unknown cloudflared mode or transport instead of falling back", () => {
		expect(parseArgv(["--cloudflared-mode", "fast"]).errors[0]).toContain("--cloudflared-mode");
		expect(parseArgv(["--cloudflared-protocol", "http3"]).errors[0]).toContain(
			"--cloudflared-protocol",
		);
		expect(parseArgv(["--cloudflared-hostname"]).errors[0]).toContain("requires a value");
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
