import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRsbuild } from "@rsbuild/core";

const adapterUrl = new URL("../dist/rsbuild/index.js", import.meta.url);
const builtFiles = [
	adapterUrl,
	new URL("../dist-client/index.html", import.meta.url),
	new URL("../dist-client/inject.js", import.meta.url),
	new URL(import.meta.resolve("@vkma.dev/bridge")),
];

let vkmaDevtoolsRsbuild;
try {
	await Promise.all(builtFiles.map(file => access(fileURLToPath(file))));
	({ vkmaDevtoolsRsbuild } = await import(adapterUrl.href));
} catch (error) {
	console.error("The local bridge/devtools builds are required for the Rsbuild playground.");
	console.error("Build the workspace packages first, then rerun this command.");
	throw error;
}

const tempRoot = tmpdir();
const tempPrefix = "vkma-rsbuild-playground-";
const markerName = ".vkma-rsbuild-playground";
const appDir = await mkdtemp(join(tempRoot, tempPrefix));
const marker = `${process.pid}:${Date.now()}`;

const packageJson = `${JSON.stringify(
	{
		name: "@vkma.dev/rsbuild-playground-temp",
		private: true,
		type: "module",
	},
	null,
	2,
)}\n`;

const html = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>vkma Rsbuild playground</title>
		<style>
			body { margin: 0; font-family: sans-serif; background: #f5f5f5; color: #222; }
			main { display: grid; gap: 8px; max-width: 560px; margin: 40px auto; padding: 24px; }
			h1 { font-size: 20px; margin: 0 0 8px; }
			button { padding: 8px 12px; text-align: left; }
			pre { min-height: 80px; padding: 12px; overflow: auto; background: #fff; white-space: pre-wrap; }
		</style>
	</head>
	<body>
		<div id="root"></div>
	</body>
</html>
`;

const source = `import bridge from "@vkma.dev/bridge";

const root = document.querySelector("#root");
const title = document.createElement("h1");
title.textContent = "vkma temporary Rsbuild playground";
const log = document.createElement("pre");
root.append(title, log);

function write(message, value) {
	const suffix = value === undefined ? "" : " " + JSON.stringify(value);
	log.textContent = message + suffix + "\\n" + log.textContent;
}

// Fake the standalone VK host: echo every request back with its request_id
// intact so sends resolve and the devtools can pair requests and responses.
window.addEventListener("message", event => {
	const payload = event.data;
	if (event.source !== window || payload?.type !== "vk-connect") {
		return;
	}
	if (typeof payload.handler === "string" && payload.params !== undefined) {
		window.postMessage({ type: payload.handler, data: payload.params }, "*");
	}
});

bridge.subscribe(event => {
	write("bridge event: " + event.detail.type, event.detail.data);
});

function send(name, params) {
	bridge
		.send(name, params)
		.then(result => write("response: " + name, result))
		.catch(error => write("error: " + name, String(error)));
}

for (const [label, name, params] of [
	["Send VKWebAppGetUserInfo", "VKWebAppGetUserInfo", undefined],
	["Send VKWebAppSetLocation", "VKWebAppSetLocation", { location: "rsbuild-" + Date.now() }],
	["Send VKWebAppStorageSet", "VKWebAppStorageSet", { key: "counter", value: String(Date.now()) }],
]) {
	const button = document.createElement("button");
	button.textContent = label;
	button.addEventListener("click", () => send(name, params));
	root.insertBefore(button, log);
}

const unsolicited = document.createElement("button");
unsolicited.textContent = "Emit VKWebAppUpdateConfig";
unsolicited.addEventListener("click", () => {
	window.postMessage(
		{
			type: "VKWebAppUpdateConfig",
			data: { appearance: Math.random() > 0.5 ? "light" : "dark" },
		},
		"*",
	);
});
root.insertBefore(unsolicited, log);

send("VKWebAppInit");
`;

async function removeTempDir() {
	const [parent, realTempRoot] = await Promise.all([
		realpath(dirname(appDir)),
		realpath(tempRoot),
	]);
	if (parent !== realTempRoot || !basename(appDir).startsWith(tempPrefix)) {
		throw new Error(`Refusing to remove unexpected path: ${appDir}`);
	}

	const markerPath = join(appDir, markerName);
	const currentMarker = await readFile(markerPath, "utf8").catch(() => null);
	if (currentMarker !== marker) {
		console.warn(`Temporary directory is no longer marked as ours; leaving it at ${appDir}`);
		return;
	}

	await rm(appDir, { recursive: true, force: true });
	console.log(`Removed temporary playground: ${appDir}`);
}

let server;
let stopping = false;

async function stop() {
	if (stopping) {
		return;
	}
	stopping = true;

	try {
		// Never remove sources out from under a live compiler/server.
		if (server) {
			await server.close();
		}
		await removeTempDir();
	} catch (error) {
		console.error(error);
		console.error(`Temporary playground preserved at ${appDir}`);
		process.exit(1);
	}
	// Rsbuild/devframe can retain non-server handles after close().
	process.exit(0);
}

try {
	await mkdir(join(appDir, "src"));
	await writeFile(join(appDir, markerName), marker, { flag: "wx" });
	await writeFile(join(appDir, "package.json"), packageJson);
	await writeFile(join(appDir, "index.html"), html);
	await writeFile(join(appDir, "src", "index.js"), source);
} catch (error) {
	await removeTempDir();
	throw error;
}

try {
	const rsbuild = await createRsbuild({
		cwd: appDir,
		config: {
			plugins: [
				vkmaDevtoolsRsbuild({
					// The generated app imports @vkma.dev/bridge directly; there is
					// deliberately no original @vkontakte/vk-bridge import to rewrite.
					alias: false,
					mcp: process.env.VKMA_MCP === "1",
				}),
			],
			source: { entry: { index: join(appDir, "src", "index.js") } },
			html: { template: join(appDir, "index.html") },
			resolve: {
				alias: {
					// The app lives outside the workspace, so resolve its direct
					// bridge import to the local built entry without an install.
					"@vkma.dev/bridge": fileURLToPath(import.meta.resolve("@vkma.dev/bridge")),
				},
			},
		},
	});

	const started = await rsbuild.startDevServer();
	server = started.server;
	process.once("SIGINT", () => void stop());
	process.once("SIGTERM", () => void stop());

	const appUrl =
		started.urls.find(url => url.includes("localhost")) ??
		started.urls[0] ??
		`http://localhost:${started.port}/`;
	console.log(`\nTemporary Rsbuild playground: ${appUrl}`);
	console.log(`Devtools panel: ${new URL("/__vkma/", appUrl).href}`);
	console.log(`Temporary directory: ${appDir}`);
	console.log("Press Ctrl+C to close the server and remove the temporary directory.");
} catch (error) {
	if (server) {
		await server.close();
	}
	await removeTempDir();
	throw error;
}
