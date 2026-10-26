import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createInspectRuntime } from "../host/runtime.ts";
import { App } from "./App.tsx";
import "./styles.css";

/**
 * One runtime per page, created before React mounts: the PeerJS peer and
 * the DevtoolsStore must survive StrictMode's double-mounting and keep
 * their identity across reconnects.
 */
const runtime = createInspectRuntime();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App runtime={runtime} />
	</StrictMode>,
);
