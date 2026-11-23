#!/usr/bin/env node
/**
 * TEST DOUBLE for the `cloudflared` binary — never published (`files` in
 * package.json excludes `*.fake.mjs`). A test copies it into a temp dir as
 * `cloudflared`, puts that dir first on PATH and drives it through
 * environment variables:
 *
 *   FAKE_CF_STATE         directory for the launch counter and argv dumps
 *   FAKE_CF_VERSION       the version `--version` prints (default 2026.11.0)
 *   FAKE_CF_URL_DELAY     ms before the Quick Tunnel URL box (default 50)
 *   FAKE_CF_REGISTER_DELAY ms before the `Registered tunnel connection` line
 *   FAKE_CF_NO_URL        never print the URL (quick mode)
 *   FAKE_CF_CRASH_LAUNCHES  the first N launches exit with code 7 right away
 *   FAKE_CF_CRASH_FROM    every launch from N on exits with code 7 right away
 *   FAKE_CF_EXIT_AFTER    ms after the registration the process exits with 7
 *   FAKE_CF_EXIT_AFTER_LAUNCH  restrict FAKE_CF_EXIT_AFTER to launch N
 *   FAKE_CF_HANG_TERM     ignore SIGTERM (the hard-kill path)
 *
 * Every launch appends `argv-<n>.json` — `{ argv, hasToken }` — to the state
 * directory: the token's PRESENCE is recorded, never its value.
 */
import fs from "node:fs";
import path from "node:path";

const state = process.env["FAKE_CF_STATE"];
if (state === undefined) {
	console.error("fake cloudflared: FAKE_CF_STATE is not set");
	process.exit(2);
}
const number = (name, fallback) => {
	const raw = process.env[name];
	return raw === undefined || raw === "" ? fallback : Number(raw);
};
const err = line => process.stderr.write(`${new Date().toISOString()} ${line}\n`);

if (process.argv.includes("--version")) {
	console.log(
		`cloudflared version ${process.env["FAKE_CF_VERSION"] ?? "2026.11.0"} (built 20261113-20:44:36-UTC)`,
	);
	process.exit(0);
}

const counter = path.join(state, "launches");
const launch = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0) + 1;
fs.writeFileSync(counter, String(launch));
fs.writeFileSync(
	path.join(state, `argv-${String(launch)}.json`),
	JSON.stringify({
		argv: process.argv.slice(2),
		hasToken: process.env["TUNNEL_TOKEN"] !== undefined,
	}),
);

const quick = process.argv.includes("--url");
const say = line => err(line);
say("INF Requesting new quick Tunnel on trycloudflare.com...");
const crashFrom = number("FAKE_CF_CRASH_FROM", 0);
if (number("FAKE_CF_CRASH_LAUNCHES", 0) >= launch || (crashFrom > 0 && launch >= crashFrom)) {
	say("WRN crashing on purpose (test)");
	process.exit(7);
}

if (quick && process.env["FAKE_CF_NO_URL"] === undefined) {
	setTimeout(
		() => {
			say(
				"INF +--------------------------------------------------------------------------------------------+",
			);
			say(
				`INF |  https://fake-tunnel-${String(launch)}.trycloudflare.com                                                     |`,
			);
		},
		number("FAKE_CF_URL_DELAY", 50),
	);
}
setTimeout(
	() => {
		say(
			"INF Registered tunnel connection connIndex=0 connection=64272ce5-600e-45ed-8ec6-2cc00e71af1d event=0 ip=198.41.192.57 location=hel01 protocol=http2",
		);
	},
	number("FAKE_CF_REGISTER_DELAY", 80),
);

const exitAfter = number("FAKE_CF_EXIT_AFTER", 0);
const exitLaunch = number("FAKE_CF_EXIT_AFTER_LAUNCH", 0);
if (exitAfter > 0 && (exitLaunch === 0 || exitLaunch === launch)) {
	setTimeout(() => {
		say('ERR Serve tunnel error error="fake crash" connIndex=0 event=0');
		process.exit(7);
	}, exitAfter);
}

if (process.env["FAKE_CF_HANG_TERM"] === "1") {
	process.on("SIGTERM", () => say("INF pretending SIGTERM was not received"));
}
process.on("SIGTERM", () => {
	say("INF Initiating graceful shutdown due to signal terminated ...");
	say("INF Unregistered tunnel connection connIndex=0 event=0");
	say("INF Tunnel server stopped");
	process.exit(0);
});
setInterval(() => {}, 1000);
