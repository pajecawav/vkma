import bridge from "@vkma.dev/bridge";
import { VKBridgeConfigProvider } from "@vkma.dev/vkui-bridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@vkontakte/vkui/dist/vkui.css";

// Tell the host the app is ready: folds the host preloader, enables history.
void bridge.send("VKWebAppInit");

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<VKBridgeConfigProvider>
			<App />
		</VKBridgeConfigProvider>
	</StrictMode>,
);
