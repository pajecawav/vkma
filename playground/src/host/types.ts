import type {
	AdaptivityType,
	AppearanceSchemeType,
	AppearanceType,
	Insets,
} from "@vkma.dev/bridge";

export type HostMode = "fake" | "real";
export type HostAppearance = AppearanceType;
export type HostScheme = AppearanceSchemeType;
export type HostAdaptivity = AdaptivityType;
export type HostOutcome = "success" | "error" | "denied";
export type HostInsets = Insets;

export interface HostViewport {
	width: number;
	height: number;
}

export interface HostLabSnapshot {
	/** Whether installHost has run. */
	readonly active: boolean;
	/** Whether this page uses the local host instead of the real VK host. */
	readonly fake: boolean;
	readonly appearance: HostAppearance;
	readonly scheme: HostScheme;
	readonly insets: HostInsets;
	readonly adaptivity: HostAdaptivity;
	readonly viewport: HostViewport;
	/** Flat aliases are convenient for debug inputs and config assertions. */
	readonly viewportWidth: number;
	readonly viewportHeight: number;
	readonly latencyMs: number;
	readonly outcome: HostOutcome;
	/** An immutable copy; writes still go through VKWebAppStorageSet. */
	readonly storage: Readonly<Record<string, string>>;
	readonly hostStack: readonly string[];
	readonly lastLocation: string;
}

export interface HostLabActions {
	setAppearance(appearance: HostAppearance, scheme?: HostScheme): void;
	setInsets(insets: Partial<HostInsets>): void;
	setAdaptivity(adaptivity: HostAdaptivity, viewport?: Partial<HostViewport>): void;
	setLatency(latencyMs: number): void;
	setOutcome(outcome: HostOutcome): void;
	hostJump(location: string): void;
	resendLocation(): void;
	clearStorage(): void;
	/** Reset host controls and location; persisted mini-app storage is preserved. */
	reset(): void;
}

export interface HostLab {
	snapshot: HostLabSnapshot;
	actions: HostLabActions;
}
