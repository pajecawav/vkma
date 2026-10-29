import type { LooseRouteOptions, PanelLazy, PanelOptions } from "./builders.ts";
import { definePanel, type PanelDefinition } from "./define-panel.ts";

/** Brand distinguishing a {@link ViewDefinition} from raw view options. */
export const VIEW_DEFINITION = "__vkmaView" as const;

/**
 * A view hub: the ONE place a view key is written. Created by
 * {@link defineView}; its `panel()` method is the view-scoped
 * `definePanel` — it creates the definition and registers it into the
 * view's registry in call order (the order is what VKUI View children get,
 * i.e. the push/pop animation direction).
 */
export interface ViewDefinition<V extends string = string> {
	readonly [VIEW_DEFINITION]: true;
	/** The view (story) namespace and route id segment (`view:${view}`). */
	readonly view: V;
	/** Definitions registered by `panel()`, keyed by panel path. */
	readonly panels: Record<string, PanelDefinition>;
	/** Optional view-level route options passthrough (the view is a pathless layout). */
	readonly options?: LooseRouteOptions;
}

export interface ViewScope<V extends string = string> {
	/** View-scoped `definePanel` — the view argument is pre-bound. */
	panel<const P extends string, O extends PanelOptions = PanelOptions>(
		path: P,
		options: O,
		lazy?: PanelLazy,
	): PanelDefinition<V, P, O>;
}

/**
 * Declare a view hub and its panel factory:
 *
 * ```ts
 * export const feedView = defineView("feed");
 *
 * export const feedPanel = feedView.panel("feed", { loader: ... }, () => import("./feed.ui"));
 * export const postPanel = feedView.panel("post/$id", { ... }, () => import("./post.ui"));
 * ```
 *
 * The view key is written exactly once; `createApp` accepts the hub
 * directly (`views: [feedView, ...]`). Duplicate view keys are a dev-time
 * console error — a view must not sprawl across files.
 */
export function defineView<const V extends string>(
	view: V,
	options?: LooseRouteOptions,
): ViewDefinition<V> & ViewScope<V> {
	const usedPanelPaths = new Set<string>();
	const panels: Record<string, PanelDefinition> = {};
	const definition: ViewDefinition<V> = {
		[VIEW_DEFINITION]: true,
		view,
		panels,
		...(options !== undefined ? { options } : {}),
	};
	const scope: ViewScope<V> = {
		panel(path, panelOptions, lazy) {
			if (usedPanelPaths.has(path)) {
				console.error(
					`[vkma-router] duplicate panel path "${path}" in view "${view}"; panels within a view must have distinct paths`,
				);
			}
			usedPanelPaths.add(path);
			const declared = definePanel(view, path, panelOptions, lazy);
			panels[path] = declared;
			return declared;
		},
	};
	return { ...definition, ...scope };
}
