import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@vkontakte/vkui/dist/vkui.css";

import { router } from "./routes";
import { initBridgeSync } from "./sync";

initBridgeSync();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
