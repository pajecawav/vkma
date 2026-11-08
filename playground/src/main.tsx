import { RouterProvider } from "@tanstack/react-router";
import bridge from "@vkma.dev/bridge";
import { createBridgeSync, createSwipeBackManager } from "@vkma.dev/router";
import { VKBridgeConfigProvider } from "@vkma.dev/vkui-bridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./app";
import { installHost } from "./host";
import { errorText, loadSettings, showNotice } from "./store";
import "@vkontakte/vkui/dist/vkui.css";
import "./styles.css";

installHost(bridge);

void bridge
	.send("VKWebAppInit")
	.catch((error: unknown) => showNotice(`Host init failed: ${errorText(error)}`));

createBridgeSync({ history: router.history, bridge });
createSwipeBackManager({ history: router.history, bridge });

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<VKBridgeConfigProvider>
			<RouterProvider router={router} />
		</VKBridgeConfigProvider>
	</StrictMode>,
);

void loadSettings();
