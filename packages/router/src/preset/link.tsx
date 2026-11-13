import { useLinkProps, type UseLinkPropsOptions } from "@tanstack/react-router";
import {
	createElement,
	type ComponentType,
	type CSSProperties,
	type FunctionComponent,
	type MouseEvent,
	type ReactNode,
} from "react";
import { type PanelPage } from "./navigator.ts";

/**
 * Router-link props on top of a Page object, the typed counterpart of
 * `navigator.push(page, params)`. The `page` is a panel definition/handle
 * (its phantom `types.params` drives the `params` prop type).
 */
export type VkLinkProps<TParams extends Record<string, string> = Record<string, string>> = {
	/** The typed page target: a panel definition/handle or a bare PanelPage. */
	page: PanelPage<TParams>;
	/**
	 * Route preload trigger. Default `"intent"`: hover/focus on desktop,
	 * touchstart on mobile. The chunk (and loader data) is fetched BEFORE
	 * the tap, so the arriving panel paints instantly.
	 */
	preload?: false | "intent" | "render" | "viewport";
	/** Replace the history entry instead of pushing (tab/tabbar switches). */
	replace?: boolean;
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	title?: string;
	target?: string;
	rel?: string;
	disabled?: boolean;
	"aria-label"?: string;
	onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
} & ParamsMember<TParams>;

/** `"index"` and an optional leading slash normalize to the router path (navigator parity). */
export function vkLinkTarget(page: PanelPage): string {
	return page.path === "index" ? "/" : `/${page.path.replace(/^\//, "")}`;
}

/**
 * Params become REQUIRED when the type has keys (`{ id: string }`),
 * optional when empty (`ParamsOfKey<"feed">` is `{}`). The tuple wrap
 * (`[keyof T] extends [never]`) blocks distribution over union keys.
 * For POSITIONAL arguments (navigator.push-style).
 */
export type ParamsArg<TParams> = [keyof TParams] extends [never] ? TParams | undefined : TParams;

/**
 * The `params` MEMBER shape: the optionality itself is conditional —
 * `params?: T` on param-less targets, `params: T` (required) on keyed
 * ones. A plain `params?: ParamsArg<T>` stays optional forever (the `?`
 * wins over the conditional type); the intersection makes TS enforce
 * presence exactly when the phantom has keys.
 */
export type ParamsMember<TParams> = [keyof TParams] extends [never]
	? { params?: TParams }
	: { params: TParams };

export interface SplitVkLinkProps {
	to: string;
	params?: Record<string, string>;
	preload: false | "intent" | "render" | "viewport";
	replace?: boolean;
	host: Record<string, unknown>;
}

/** Pure props slicing: router options vs what the host component receives. */
export function splitVkLinkProps<TParams extends Record<string, string>>(
	props: VkLinkProps<TParams>,
): SplitVkLinkProps {
	const { page, params, preload = "intent", replace, ...host } = props;
	return {
		to: vkLinkTarget(page),
		params,
		preload,
		replace,
		host,
	};
}

/**
 * Turn ANY component (a VKUI `CellButton`, `RichCell`, your own button)
 * into a router link: client-side navigation plus route preloading on
 * hover/focus/touchstart (`preload="intent"` by default. The chunk and
 * loader data are fetched BEFORE the tap). Targets are the typed Page
 * objects `navigator.push` accepts:
 *
 * ```tsx
 * const CellButtonLink = createVkLink(CellButton);
 *
 * <CellButtonLink page={postPanel} params={{ id: "1" }}>Открыть</CellButtonLink>
 * ```
 *
 * The host component receives the anchor `href` plus the navigation and
 * preload handlers. VKUI buttons/cells spread unknown props onto their
 * interactive element, so no extra wiring is needed. A custom `onClick`
 * composes with the navigation handler (yours first, then navigate).
 */
export function createVkLink<TCompProps>(
	Comp: ComponentType<TCompProps>,
): <TParams extends Record<string, string>>(props: TCompProps & VkLinkProps<TParams>) => ReactNode {
	// `as never`: the conditional `params` member (ParamsMember) makes the
	// generic implementation fail function-variance checking against its
	// own annotation (TS instantiates the annotation's TParams at its
	// constraint, keyed ⇒ required params, while the implementation's
	// stays deferred). The annotation owns the per-call contract.
	return function VkLink<TParams extends Record<string, string>>(
		props: TCompProps & VkLinkProps<TParams>,
	): ReactNode {
		const { page, params, preload = "intent", replace, onClick, ...host } = props;
		const options: UseLinkPropsOptions = {
			to: vkLinkTarget(page),
			params,
			preload,
			replace,
		} as UseLinkPropsOptions;
		const anchor = useLinkProps(options);
		// createElement's overloads reject a ComponentType UNION and an
		// unresolved generic; concretize both sides — the cast is
		// type-level only, the runtime handles class components too
		return createElement(
			Comp as FunctionComponent<Record<string, unknown>>,
			{
				...host,
				...anchor,
				onClick: (event: MouseEvent<HTMLAnchorElement>) => {
					onClick?.(event);
					// TanStack's handler preventDefaults and navigates client-side
					if (!event.defaultPrevented) {
						anchor.onClick?.(event);
					}
				},
			} as Record<string, unknown>,
		);
	} as never;
}
