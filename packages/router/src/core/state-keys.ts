/** The key the popout overlay rides under in `history.state`. */
export const POPOUT_STATE_KEY = "vkma:popout";

export interface PopoutState {
	id: string;
	props?: Record<string, unknown>;
}

/** The key runtime modal props ride under in `history.state`. */
export const MODAL_STATE_KEY = "vkma:modal";

export interface ModalState {
	/** Serializable props passed via `showModal({ props })`. */
	props?: unknown;
}

export function readModalState(state: unknown): ModalState | undefined {
	if (state !== null && typeof state === "object" && MODAL_STATE_KEY in state) {
		const modal = (state as Record<string, unknown>)[MODAL_STATE_KEY];
		if (modal !== null && typeof modal === "object") {
			return modal as ModalState;
		}
	}
	return undefined;
}

export function readPopoutState(state: unknown): PopoutState | undefined {
	if (state !== null && typeof state === "object" && POPOUT_STATE_KEY in state) {
		const popout = (state as Record<string, unknown>)[POPOUT_STATE_KEY];
		if (
			popout !== null &&
			typeof popout === "object" &&
			typeof (popout as PopoutState).id === "string"
		) {
			return popout as PopoutState;
		}
	}
	return undefined;
}
