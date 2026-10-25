/** The key the popout overlay rides under in `history.state`. */
export const POPOUT_STATE_KEY = "vkma:popout";

export interface PopoutState {
	id: string;
	props?: Record<string, unknown>;
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
