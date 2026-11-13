import type { ComponentType } from "react";
import type { ModalEntryComponent } from "../vkui/modals.tsx";
import type { ModalComponent } from "./builders.tsx";
import type { ParamsOfKey, PanelOptions } from "./builders.tsx";

/**
 * Definition-typed overlays (DESIGN "Type safety", 2026-11-13): every
 * overlay channel is a typed handle instead of a bare string id +
 * `unknown` props. A modal declaration carries its props as a phantom
 * (`props: {} as ShareProps` — inert at runtime); a popout infers them
 * from its component's own signature (the component IS the props
 * declaration). The panel definition exposes flattened handles
 * (`panel.modals.share`, `panel.modals['owner.invite']`); global modals
 * and popouts are declared as definitions next to their components
 * (`defineGlobalModal`, `definePopout`) — the id is written once where
 * the overlay lives, `createApp` only nests it.
 *
 * Props phantoms stay DECOUPLED from chunk component types: a component
 * type riding the definition's phantom re-opens the TS7022 inference
 * cycle the definition boundary exists to break (a modal chunk imports
 * its panel's hub for the handle). Popout components imported into a
 * hub must carry annotated signatures if their module imports the hub
 * back.
 */

/** Brand distinguishing a {@link ModalHandle} from raw navigate options. */
export const MODAL_HANDLE = "__vkmaModalHandle" as const;

/**
 * A typed route-modal handle: the navigation target plus the phantom
 * `{ params, props }` types. Created by the owning panel definition
 * (`panel.modals.share`); `navigator.showModal(handle, { params,
 * props })` and `useModalProps(handle)` read the phantom.
 */
export interface ModalHandle<
	TParams extends Record<string, string> = Record<string, string>,
	TProps = unknown,
> {
	readonly [MODAL_HANDLE]: true;
	/** Full modal route path: the panel's path + every modal segment. */
	readonly path: string;
	/** Phantom carrier: the panel's path params + this modal's props. */
	readonly types?: { params: TParams; props: TProps };
}

/** Brand distinguishing a {@link PopoutHandle} from a bare popout id. */
export const POPOUT_HANDLE = "__vkmaPopoutHandle" as const;

/**
 * A typed popout handle: the registry id plus the phantom props type.
 * Created by the owning panel definition (`panel.popouts.delete`) or by
 * {@link definePopout} for global ones.
 */
export interface PopoutHandle<TProps = Record<string, unknown>> {
	readonly [POPOUT_HANDLE]: true;
	/** Registry id (the declaration key); resolution stays local → global. */
	readonly id: string;
	/** Phantom carrier: the props `showPopout(handle, props)` accepts. */
	readonly types?: { props: TProps };
}

/** Brand distinguishing a {@link GlobalModalDefinition} from a component. */
export const GLOBAL_MODAL = "__vkmaGlobalModal" as const;

/**
 * A global (`?modal=<id>`) modal declared as a definition — mirrors the
 * `defineView` hub pattern: the id is written once where the modal
 * lives, `createApp({ modals: { settings: settingsModal } })` nests it
 * and an id mismatch is a dev-time console error. The definition IS the
 * typed handle for `showGlobalModal` / `useModalProps`.
 */
export interface GlobalModalDefinition<K extends string = string, TProps = unknown> {
	readonly [GLOBAL_MODAL]: true;
	/** The `?modal=` id — must match the record key in `createApp`. */
	readonly modal: K;
	readonly component: ModalEntryComponent;
	/** Phantom carrier: the props `showGlobalModal(def, { props })` accepts. */
	readonly types?: { props: TProps };
}

/**
 * Declare a global modal next to its component:
 *
 * ```ts
 * export const settingsModal = defineGlobalModal("settings", {
 *   component: SettingsModal,
 *   props: {} as SettingsModalProps,
 * });
 * ```
 *
 * `props` is a TYPE-ONLY carrier (the value is never read); omit it for
 * prop-less modals. Nest the definition under the same key in
 * `createApp({ modals })` — the hub's id and the nesting key must match.
 */
export function defineGlobalModal<const K extends string, TProps = unknown>(
	modal: K,
	declaration: { component: ModalEntryComponent; props?: TProps },
): GlobalModalDefinition<K, TProps> {
	return {
		[GLOBAL_MODAL]: true,
		modal,
		component: declaration.component,
	};
}

/** Brand distinguishing a {@link PopoutDefinition} from a component. */
export const POPOUT_DEFINITION = "__vkmaPopout" as const;

/** What a popouts record accepts: the component or a definition. `any`
 * props on purpose — a popout may require arbitrary props (delivered
 * from history.state by the host); the TYPED surface is the handle
 * layer ({@link PopoutPropsOf} infers from the concrete signature). */
export type PopoutComponent = ComponentType<any>;

/**
 * A popout declared as a definition — mirrors `defineGlobalModal`: the
 * id is written once where the popout lives, `createApp({ popouts })`
 * nests it and an id mismatch is a dev-time console error. The
 * definition doubles as the typed handle for `showPopout`.
 */
export interface PopoutDefinition<
	K extends string = string,
	C extends PopoutComponent = PopoutComponent,
> {
	readonly [POPOUT_DEFINITION]: true;
	/** Registry id — must match the record key in `createApp`. */
	readonly popout: K;
	readonly Component: C;
	/** Phantom carrier: the props `showPopout(def, props)` accepts. */
	readonly types?: { props: PopoutPropsOf<C> };
}

/** The props a popout's caller supplies: the component's own minus `onClose` (injected). */
export type PopoutPropsOf<C> = C extends ComponentType<infer P> ? Omit<P, "onClose"> : never;

/**
 * Declare a popout next to its component (the panel-local form infers
 * from the bare component inside `PanelOptions.popouts`):
 *
 * ```ts
 * export const resetPopout = definePopout("reset", ResetPopout);
 * ```
 *
 * The props phantom infers from the component's own signature minus the
 * router-injected `onClose`.
 */
export function definePopout<const K extends string, const C extends PopoutComponent>(
	popout: K,
	Component: C,
): PopoutDefinition<K, C> {
	return {
		[POPOUT_DEFINITION]: true,
		popout,
		Component,
	};
}

/** The props a declared modal carries (its `props` phantom, `unknown` when absent). */
export type ModalPropsOf<M extends ModalComponent> = M extends { props: infer TProps }
	? TProps
	: unknown;

/** All modal keys of a declaration record, nested chains flattened to dotted paths. */
type FlatModalKeys<M extends Record<string, ModalComponent>> = {
	[K in keyof M & string]: M[K] extends { modals: infer N extends Record<string, ModalComponent> }
		? K | `${K}.${FlatModalKeys<N>}`
		: K;
}[keyof M & string];

/** The nested modals record of a declaration ({} when it has none). */
type ModalChildrenOf<E extends ModalComponent> = E extends {
	modals: infer N extends Record<string, ModalComponent>;
}
	? N
	: Record<string, ModalComponent>;

/** The `props` phantom of the modal at a (possibly dotted) key. */
type ModalPropsAtPath<
	M extends Record<string, ModalComponent>,
	K extends string,
> = K extends `${infer Head}.${infer Rest}`
	? Head extends keyof M
		? ModalPropsAtPath<ModalChildrenOf<M[Head]>, Rest>
		: unknown
	: K extends keyof M
		? ModalPropsOf<M[K]>
		: unknown;

/**
 * The typed modal handles of a panel: one per declared modal, nested
 * chains flattened to dotted keys. Every level shares the panel's path
 * params (modal routes are children of the panel route).
 */
export type ModalHandlesOf<P extends string, O extends PanelOptions> = O extends {
	modals: infer M extends Record<string, ModalComponent>;
}
	? { [K in FlatModalKeys<M>]: ModalHandle<ParamsOfKey<P>, ModalPropsAtPath<M, K & string>> }
	: Record<string, never>;

/** The props phantom of one popouts-record entry (component or definition). */
export type PopoutPropsOfEntry<E> = E extends {
	readonly [POPOUT_DEFINITION]: true;
	Component: infer C;
}
	? PopoutPropsOf<C>
	: E extends ComponentType<infer P>
		? Omit<P, "onClose">
		: never;

/** The typed popout handles of a panel: one per declared popout key. */
export type PopoutHandlesOf<O extends PanelOptions> = O extends {
	popouts: infer PS extends Record<string, PopoutComponent | PopoutDefinition>;
}
	? { [K in keyof PS & string]: PopoutHandle<PopoutPropsOfEntry<PS[K]>> }
	: Record<string, never>;

/** Normalize a declared modal into its declaration form (props/modals are optional members). */
export function asDeclaration(value: ModalComponent): {
	component: ModalEntryComponent;
	props?: unknown;
	modals?: Record<string, ModalComponent>;
} {
	// shape check, NOT typeof: lazy/memo/forwardRef components are objects
	return typeof value === "object" && value !== null && "component" in value
		? value
		: { component: value };
}

/**
 * The props TYPE-ONLY carrier for a modal declaration — write
 * `props: modalProps<ShareProps>()`. The value is `undefined` and NEVER
 * read at runtime; the generic parameter is the whole point: it rides
 * the declaration's phantom into `showModal(handle, { props })` and
 * `useModalProps(handle)` without an assertion at the call site.
 */
export function modalProps<TProps>(): TProps {
	return undefined as TProps;
}

/** `"index"` and an optional leading slash normalize to the full panel path. */
function panelFullPathOf(panelPath: string): string {
	return panelPath === "index" || panelPath === "/" ? "/" : `/${panelPath.replace(/^\//, "")}`;
}

/**
 * Build the runtime modal handle map of a panel (the value behind
 * `panel.modals`): one handle per declared modal, nested chains
 * flattened to dotted keys — the same shape {@link ModalHandlesOf}
 * computes at the type level.
 */
export function modalHandlesOf(
	panelPath: string,
	modals: Record<string, ModalComponent>,
): Record<string, ModalHandle> {
	const handles: Record<string, ModalHandle> = {};
	const walk = (
		entries: Record<string, ModalComponent>,
		prefix: string,
		parentPath: string,
	): void => {
		for (const [key, declared] of Object.entries(entries)) {
			const { modals: nested } = asDeclaration(declared);
			const path = parentPath === "/" ? `/${key}` : `${parentPath}/${key}`;
			const flatKey = prefix === "" ? key : `${prefix}.${key}`;
			handles[flatKey] = { [MODAL_HANDLE]: true, path };
			if (nested !== undefined) {
				walk(nested, flatKey, path);
			}
		}
	};
	walk(modals, "", panelFullPathOf(panelPath));
	return handles;
}

/**
 * Build the runtime popout handle map of a panel (the value behind
 * `panel.popouts`): one handle per declared popout key, carrying the
 * registry id.
 */
export function popoutHandlesOf(
	popouts: Record<string, PopoutComponent | PopoutDefinition>,
): Record<string, PopoutHandle> {
	const handles: Record<string, PopoutHandle> = {};
	for (const id of Object.keys(popouts)) {
		handles[id] = { [POPOUT_HANDLE]: true, id };
	}
	return handles;
}

/** Runtime discriminators for the navigator's typed overloads. */
export function isModalHandle(value: unknown): value is ModalHandle {
	return typeof value === "object" && value !== null && MODAL_HANDLE in value;
}

export function isPopoutHandle(value: unknown): value is PopoutHandle {
	return typeof value === "object" && value !== null && POPOUT_HANDLE in value;
}

export function isGlobalModalDefinition(value: unknown): value is GlobalModalDefinition {
	return typeof value === "object" && value !== null && GLOBAL_MODAL in value;
}

export function isPopoutDefinition(value: unknown): value is PopoutDefinition {
	return typeof value === "object" && value !== null && POPOUT_DEFINITION in value;
}
