import bridge from "@vkma.dev/bridge";
import { useSyncExternalStore } from "react";
import {
	INITIAL_INVITATIONS,
	INITIAL_MEETINGS,
	type Invitation,
	type InvitationStatus,
	type Meeting,
	type MeetingInput,
} from "./data";

export type MeetingFilter = "all" | "mine" | "weekend";
export type SettingsStatus = "loading" | "ready" | "error";

export interface PlannerSettings {
	notifications: boolean;
	compactList: boolean;
	defaultFilter: MeetingFilter;
}

interface Notice {
	id: number;
	text: string;
}

interface PlannerState {
	meetings: Meeting[];
	invitations: Invitation[];
	settings: PlannerSettings;
	settingsStatus: SettingsStatus;
	notice: Notice | null;
}

export const DEFAULT_SETTINGS: PlannerSettings = {
	notifications: true,
	compactList: false,
	defaultFilter: "all",
};

const SETTINGS_KEY = "vkma-planner-settings";
const listeners = new Set<() => void>();
let noticeId = 0;
let state: PlannerState = {
	meetings: INITIAL_MEETINGS,
	invitations: INITIAL_INVITATIONS,
	settings: DEFAULT_SETTINGS,
	settingsStatus: "loading",
	notice: null,
};

function setState(patch: Partial<PlannerState>): void {
	state = { ...state, ...patch };
	for (const listener of listeners) {
		listener();
	}
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getState(): PlannerState {
	return state;
}

export function usePlannerState(): PlannerState {
	return useSyncExternalStore(subscribe, getState, getState);
}

export function findMeeting(id: string): Meeting | undefined {
	return state.meetings.find(meeting => meeting.id === id);
}

export function meetingOf(id: string): Meeting {
	const meeting = findMeeting(id);
	if (meeting === undefined) {
		throw new Error(`Unknown meeting "${id}" — the route guard should have caught it`);
	}
	return meeting;
}

export function invitationOf(id: string): Invitation {
	const invitation = state.invitations.find(candidate => candidate.id === id);
	if (invitation === undefined) {
		throw new Error(`Unknown invitation "${id}" — the route guard should have caught it`);
	}
	return invitation;
}

export function showNotice(text: string): void {
	setState({ notice: { id: ++noticeId, text } });
}

export function dismissNotice(): void {
	setState({ notice: null });
}

export function addMeeting(input: MeetingInput): Meeting {
	const meeting: Meeting = {
		...input,
		id: `custom-${Date.now()}`,
		organizerId: "me",
		attendeeIds: ["me"],
	};
	setState({ meetings: [...state.meetings, meeting] });
	return meeting;
}

export function updateMeeting(id: string, input: MeetingInput): void {
	setState({
		meetings: state.meetings.map(meeting =>
			meeting.id === id ? { ...meeting, ...input } : meeting,
		),
	});
}

export function removeMeeting(id: string): void {
	setState({ meetings: state.meetings.filter(meeting => meeting.id !== id) });
}

export function answerInvitation(id: string, status: Exclude<InvitationStatus, "pending">): void {
	const invitation = invitationOf(id);
	setState({
		invitations: state.invitations.map(candidate =>
			candidate.id === id ? { ...candidate, status } : candidate,
		),
		meetings:
			status === "accepted" && findMeeting(`invitation-${id}`) === undefined
				? [
						...state.meetings,
						{
							id: `invitation-${id}`,
							title: invitation.title,
							description: invitation.note,
							day: invitation.day,
							time: invitation.time,
							place: invitation.place,
							organizerId: invitation.fromId,
							attendeeIds: [invitation.fromId, "me"],
						},
					]
				: state.meetings,
	});
}

export async function loadSettings(): Promise<void> {
	setState({ settingsStatus: "loading" });
	try {
		const response = await bridge.send("VKWebAppStorageGet", { keys: [SETTINGS_KEY] });
		const raw = response.keys.find(item => item.key === SETTINGS_KEY)?.value;
		if (raw !== undefined && raw !== "") {
			setState({ settings: parseSettings(JSON.parse(raw)), settingsStatus: "ready" });
		} else {
			setState({ settingsStatus: "ready" });
		}
	} catch (error) {
		setState({ settingsStatus: "error" });
		showNotice(`Настройки не загрузились: ${errorText(error)}`);
	}
}

export async function saveSettings(settings: PlannerSettings): Promise<boolean> {
	setState({ settings });
	try {
		await bridge.send("VKWebAppStorageSet", {
			key: SETTINGS_KEY,
			value: JSON.stringify(settings),
		});
		setState({ settingsStatus: "ready" });
		return true;
	} catch (error) {
		setState({ settingsStatus: "error" });
		showNotice(`Не удалось сохранить настройки: ${errorText(error)}`);
		return false;
	}
}

export function resetPlanner(): void {
	setState({
		meetings: INITIAL_MEETINGS,
		invitations: INITIAL_INVITATIONS,
		notice: null,
	});
	showNotice("Встречи и приглашения вернулись к исходным fixtures");
}

export function errorText(error: unknown): string {
	if (typeof error === "object" && error !== null) {
		const errorType = Reflect.get(error, "error_type");
		if (typeof errorType === "string") {
			return errorType;
		}
	}
	return error instanceof Error ? error.message : "неизвестная ошибка host";
}

function parseSettings(value: unknown): PlannerSettings {
	if (typeof value !== "object" || value === null) {
		return DEFAULT_SETTINGS;
	}
	const record = value as Record<string, unknown>;
	const filter = record["defaultFilter"];
	return {
		notifications:
			typeof record["notifications"] === "boolean"
				? record["notifications"]
				: DEFAULT_SETTINGS.notifications,
		compactList:
			typeof record["compactList"] === "boolean"
				? record["compactList"]
				: DEFAULT_SETTINGS.compactList,
		defaultFilter:
			filter === "all" || filter === "mine" || filter === "weekend"
				? filter
				: DEFAULT_SETTINGS.defaultFilter,
	};
}
