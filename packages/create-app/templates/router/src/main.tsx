import { RouterProvider } from "@tanstack/react-router";
import bridge from "@vkma.dev/bridge";
import { createBridgeSync, createSwipeBackManager, type VkBridgeLike } from "@vkma.dev/router";
import { AppRoot, ConfigProvider } from "@vkontakte/vkui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./app";
import "@vkontakte/vkui/dist/vkui.css";

// Tell the host the app is ready: folds the host preloader, enables history.
void bridge.send("VKWebAppInit");

// The router's structural bridge contract expects `subscribe` to return an
// unsubscribe; the classic API pairs it with `unsubscribe(listener)` instead —
// adapted once, here at the app boundary.
const hostBridge: VkBridgeLike = {
	send: bridge.send.bind(bridge),
	subscribe: handler => {
		bridge.subscribe(handler);
		return () => bridge.unsubscribe(handler);
	},
};

// The host must learn the app location; native swipe-back follows history.
createBridgeSync({ history: router.history, bridge: hostBridge });
createSwipeBackManager({ history: router.history, bridge: hostBridge });

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ConfigProvider>
			<AppRoot>
				<RouterProvider router={router} />
			</AppRoot>
		</ConfigProvider>
	</StrictMode>,
);
