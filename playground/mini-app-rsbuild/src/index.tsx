import bridge from "@vkontakte/vk-bridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// The app talks to what it believes is the real vk-bridge; the devtools
// plugin's dev interception routes it through the @vkma.dev/bridge tap.
void bridge.send("VKWebAppInit");

// A fake VK client: vk-bridge posts `{ type: 'vk-connect', handler, params }`
// to the parent frame and waits for `{ type: methodName, data }` back. In a
// standalone tab the parent is this very window, so we echo the requests —
// including the devtools' `request_id`, which resolves the send promises.
window.addEventListener("message", event => {
	const payload = event.data as {
		type?: string;
		handler?: string;
		params?: Record<string, unknown>;
	} | null;
	if (event.source !== window || payload?.type !== "vk-connect") {
		return;
	}
	if (payload.handler !== undefined && payload.params !== undefined) {
		window.postMessage({ type: payload.handler, data: payload.params }, "*");
	}
});

bridge.subscribe(event => {
	console.log("[playground] bridge event:", event.detail.type, event.detail.data);
});

function App() {
	const send = (name: string, params?: Record<string, unknown>) => {
		void bridge
			.send(name as never, params as never)
			.then(result => console.log("[playground] response:", result))
			.catch(error => console.log("[playground] error:", error));
	};

	const emitUnsolicited = () => {
		// Simulates VK pushing an event into the app (no request involved).
		window.postMessage(
			{
				type: "VKWebAppUpdateConfig",
				data: { appearance: Math.random() > 0.5 ? "light" : "dark" },
			},
			"*",
		);
	};

	return (
		<main style={{ fontFamily: "sans-serif", padding: 24, display: "grid", gap: 8 }}>
			<h1 style={{ fontSize: 16 }}>vkma playground</h1>
			<button onClick={() => send("VKWebAppGetUserInfo")}>send VKWebAppGetUserInfo</button>
			<button
				onClick={() =>
					send("VKWebAppSetLocation", { location: `screen-${Date.now() % 100}` })
				}
			>
				send VKWebAppSetLocation
			</button>
			<button
				onClick={() =>
					send("VKWebAppStorageSet", { key: "counter", value: String(Date.now()) })
				}
			>
				send VKWebAppStorageSet
			</button>
			<button onClick={emitUnsolicited}>emit VKWebAppUpdateConfig</button>
		</main>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
