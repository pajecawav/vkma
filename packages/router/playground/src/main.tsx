import { RouterProvider } from "@tanstack/react-router";
import { createBridgeSync, createSwipeBackManager } from "@vkma.dev/router";
import { AppRoot, ConfigProvider, SplitCol, SplitLayout } from "@vkontakte/vkui";
import { StrictMode } from "react";
import "@vkontakte/vkui/dist/vkui.css";

import { createRoot } from "react-dom/client";
import { fakeBridge } from "./bridge";
import { router } from "./routes";

// the host must learn the app location; native swipe-back follows history
createBridgeSync({ history: router.history, bridge: fakeBridge });
createSwipeBackManager({ history: router.history, bridge: fakeBridge });

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ConfigProvider platform="ios">
			<AppRoot>
				<SplitLayout>
					<SplitCol animate>
						<RouterProvider router={router} />
					</SplitCol>
				</SplitLayout>
			</AppRoot>
		</ConfigProvider>
	</StrictMode>,
);
