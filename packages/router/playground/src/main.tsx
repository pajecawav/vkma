import { RouterProvider } from "@tanstack/react-router";
import { createBridgeSync, createSwipeBackManager } from "@vkma.dev/router";
import { AppRoot, ConfigProvider } from "@vkontakte/vkui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@vkontakte/vkui/dist/vkui.css";

import { router } from "./app";
import { fakeBridge } from "./bridge";

// the host must learn the app location; native swipe-back follows history
createBridgeSync({ history: router.history, bridge: fakeBridge });
createSwipeBackManager({ history: router.history, bridge: fakeBridge });

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ConfigProvider platform="android">
			<AppRoot>
				<RouterProvider router={router} />
			</AppRoot>
		</ConfigProvider>
	</StrictMode>,
);
