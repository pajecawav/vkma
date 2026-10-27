import { StrictMode } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
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

/** Remote rows are foreign input: a single hostile event must never
 * unmount the whole panel (there is no error boundary deeper in the
 * tree, and the operator needs the panel alive to deny the source). */
class PanelErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	public state: { error: Error | null } = { error: null };

	public static getDerivedStateFromError(error: Error): { error: Error | null } {
		return { error };
	}

	public componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("[vkma-inspect] panel render error", error, info.componentStack);
	}

	public render(): ReactNode {
		if (this.state.error !== null) {
			return (
				<div className="grid h-dvh place-items-center p-6">
					<div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-5 text-sm dark:border-red-500/30 dark:bg-red-500/10">
						<h1 className="font-semibold text-red-700 dark:text-red-300">
							The panel hit a render error
						</h1>
						<p className="mt-2 leading-relaxed text-red-600/90 dark:text-red-300/80">
							A remote row (event, client card or execute result) failed to render.
							The connection is still live — reload to reconnect, and consider denying
							the page that sent it.
						</p>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="mt-4 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
						>
							Reload panel
						</button>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<PanelErrorBoundary>
			<App runtime={runtime} />
		</PanelErrorBoundary>
	</StrictMode>,
);
