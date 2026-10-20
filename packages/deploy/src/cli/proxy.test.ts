import { describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { setupProxy, type SetGlobalProxyFromEnv } from "./proxy.ts";

interface LoggerSpy {
	info: string[];
	warn: string[];
	secrets: string[];
}

function makeLogger(): LoggerSpy {
	const spy: LoggerSpy = { info: [], warn: [], secrets: [] };
	return spy;
}

function loggerInterface(spy: LoggerSpy) {
	return {
		info: (message: string) => spy.info.push(message),
		warn: (message: string) => spy.warn.push(message),
		addSecret: (secret: string) => spy.secrets.push(secret),
	};
}

function makeSetter(): { calls: Record<string, string>[]; setter: SetGlobalProxyFromEnv } {
	const calls: Record<string, string>[] = [];
	return {
		calls,
		setter: (envLike?: Record<string, string>) => {
			calls.push(envLike ?? {});
		},
	};
}

const NO_PROXY_ENV = { NO_PROXY: "localhost,127.0.0.1" };

describe("setupProxy", () => {
	it("does nothing when no source is configured", () => {
		const logger = makeLogger();
		const { calls, setter } = makeSetter();
		const result = setupProxy({ env: {} }, loggerInterface(logger), setter);
		expect(result).toBeUndefined();
		expect(calls).toEqual([]);
		expect(logger.info).toEqual([]);
	});

	it("activates the setter with the config proxy and reports the source", () => {
		const logger = makeLogger();
		const { calls, setter } = makeSetter();
		const result = setupProxy(
			{ configProxy: "http://proxy.corp:8080", env: {} },
			loggerInterface(logger),
			setter,
		);
		expect(result).toEqual({ url: "http://proxy.corp:8080", source: "config proxy" });
		expect(calls).toEqual([
			{ HTTP_PROXY: "http://proxy.corp:8080", HTTPS_PROXY: "http://proxy.corp:8080" },
		]);
		expect(logger.info[0]).toContain("Using proxy http://proxy.corp:8080 (from config proxy)");
	});

	it("env beats config, flag beats env (package layering)", () => {
		const { calls, setter } = makeSetter();
		const result = setupProxy(
			{
				configProxy: "http://from-config:1",
				env: { HTTPS_PROXY: "http://from-env:2" },
			},
			loggerInterface(makeLogger()),
			setter,
		);
		expect(result).toEqual({ url: "http://from-env:2", source: "HTTPS_PROXY" });

		const flagResult = setupProxy(
			{
				flagProxy: "http://from-flag:3",
				configProxy: "http://from-config:1",
				env: { HTTPS_PROXY: "http://from-env:2" },
			},
			loggerInterface(makeLogger()),
			setter,
		);
		expect(flagResult).toEqual({ url: "http://from-flag:3", source: "--proxy" });
		expect(calls.length).toBe(2);
	});

	it("lowercase env vars take precedence over uppercase (Node semantics)", () => {
		const { calls, setter } = makeSetter();
		const result = setupProxy(
			{ env: { HTTPS_PROXY: "http://upper:1", https_proxy: "http://lower:2" } },
			loggerInterface(makeLogger()),
			setter,
		);
		expect(result).toEqual({ url: "http://lower:2", source: "https_proxy" });
		expect(calls).toEqual([{ HTTP_PROXY: "http://lower:2", HTTPS_PROXY: "http://lower:2" }]);
	});

	it("passes NO_PROXY through to the setter", () => {
		const { calls, setter } = makeSetter();
		setupProxy(
			{ configProxy: "http://proxy:1", env: { ...NO_PROXY_ENV } },
			loggerInterface(makeLogger()),
			setter,
		);
		expect(calls[0]?.["NO_PROXY"]).toBe("localhost,127.0.0.1");
	});

	it("rejects non-http(s) proxy URLs with a config error naming the source", () => {
		const { calls, setter } = makeSetter();
		const attempt = () =>
			setupProxy(
				{ configProxy: "socks5://proxy:1080", env: {} },
				loggerInterface(makeLogger()),
				setter,
			);
		expect(attempt).toThrow(DeployError);
		expect(attempt).toThrow(/from config proxy/);
		expect(calls).toEqual([]);
	});

	it("masks credentials in the info line and registers the password as a secret", () => {
		const logger = makeLogger();
		const { setter } = makeSetter();
		setupProxy(
			{ configProxy: "http://user:hunter2@proxy.corp:8080", env: {} },
			loggerInterface(logger),
			setter,
		);
		expect(logger.info[0]).toContain("http://user:***@proxy.corp:8080");
		expect(logger.info[0]).not.toContain("hunter2");
		expect(logger.secrets).toContain("hunter2");
	});

	it("warns and continues without a proxy when the runtime lacks native support", () => {
		const logger = makeLogger();
		const result = setupProxy(
			{ env: { HTTPS_PROXY: "http://proxy:1" } },
			loggerInterface(logger),
			undefined,
		);
		expect(result).toBeUndefined();
		expect(logger.warn[0]).toMatch(/no native proxy support/);
		expect(logger.warn[0]).toMatch(/22\.21/);
		expect(logger.info).toEqual([]);
	});
});
