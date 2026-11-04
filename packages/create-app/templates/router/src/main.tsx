import { RouterProvider } from "@tanstack/react-router";
import bridge from "@vkma.dev/bridge";
import { createBridgeSync, createSwipeBackManager } from "@vkma.dev/router";
import { VKBridgeConfigProvider } from "@vkma.dev/vkui-bridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./app";
import "@vkontakte/vkui/dist/vkui.css";

// Tell the host the app is ready: folds the host preloader, enables history.
void bridge.send("VKWebAppInit");

// The host must learn the app location; native swipe-back follows history.
// The default bridge instance satisfies the router's structural
// VkBridgeLike contract out of the box.
createBridgeSync({ history: router.history, bridge });
createSwipeBackManager({ history: router.history, bridge });

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<VKBridgeConfigProvider>
			<RouterProvider router={router} />
		</VKBridgeConfigProvider>
	</StrictMode>,
);
