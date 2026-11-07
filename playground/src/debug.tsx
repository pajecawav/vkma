import { useRouterState } from "@tanstack/react-router";
import {
	Button,
	ButtonGroup,
	Footnote,
	FormItem,
	Group,
	Header,
	Input,
	NativeSelect,
	SimpleCell,
} from "@vkontakte/vkui";
import {
	useEffect,
	useState,
	useSyncExternalStore,
	type ReactElement,
	type ReactNode,
} from "react";
import { useHostLab } from "./host";

const DEBUG_KEY = "vkma:planner:debug";
let debugArmed = false;
try {
	debugArmed = window.localStorage.getItem(DEBUG_KEY) === "1";
} catch {
	// The URL switch still works when localStorage is unavailable.
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
function getDebugArmed(): boolean {
	return debugArmed;
}
function setDebugArmed(armed: boolean): void {
	debugArmed = armed;
	try {
		if (armed) {
			window.localStorage.setItem(DEBUG_KEY, "1");
		} else {
			window.localStorage.removeItem(DEBUG_KEY);
		}
	} catch {
		// Keep the in-memory flag.
	}
	for (const listener of listeners) {
		listener();
	}
}

export function DebugOverlay(): ReactElement | null {
	const searchDebug = useRouterState({
		select: state =>
			new URLSearchParams(state.location.searchStr.replace(/^\?/, "")).get("debug"),
	});
	const armed = useSyncExternalStore(subscribe, getDebugArmed, () => false);
	useEffect(() => {
		if (searchDebug === "1") {
			setDebugArmed(true);
		}
		if (searchDebug === "0") {
			setDebugArmed(false);
		}
	}, [searchDebug]);

	return armed ? <HostLabPanel /> : null;
}

function HostLabPanel(): ReactElement {
	const pathname = useRouterState({ select: state => state.location.pathname });
	const searchStr = useRouterState({ select: state => state.location.searchStr });
	const index = useRouterState({
		select: state =>
			(state.location.state as { __TSR_index?: number } | undefined)?.__TSR_index,
	});
	const modalId = useRouterState({
		select: state => (state.location.search as { modal?: string } | undefined)?.modal,
	});
	const { snapshot, actions } = useHostLab();
	const [jumpTarget, setJumpTarget] = useState("/about");

	return (
		<aside className="host-debug" aria-label="Host lab">
			<Group
				header={
					<Header size="s" subtitle={snapshot.fake ? "fake host" : "real VK host"}>
						Host lab
					</Header>
				}
			>
				<SimpleCell subtitle={`index ${index ?? "null"} · modal ${modalId ?? "—"}`}>
					{pathname}
					{searchStr}
				</SimpleCell>
				<SimpleCell multiline subtitle={`stack: ${snapshot.hostStack.join(" | ")}`}>
					SetLocation: {snapshot.lastLocation || "—"}
				</SimpleCell>
				{!snapshot.fake && (
					<Footnote style={{ padding: 12 }}>
						В реальном VK лаборатория read-only: подменять host events нельзя. Ошибки и
						отмены проверяются на настоящих действиях.
					</Footnote>
				)}
				{snapshot.fake && (
					<>
						<FormItem top="Appearance">
							<NativeSelect
								value={snapshot.appearance}
								onChange={event =>
									actions.setAppearance(event.target.value as "light" | "dark")
								}
							>
								<option value="light">light</option>
								<option value="dark">dark</option>
							</NativeSelect>
						</FormItem>
						<FormItem top="Adaptivity">
							<NativeSelect
								value={snapshot.adaptivity}
								onChange={event =>
									actions.setAdaptivity(
										event.target.value as typeof snapshot.adaptivity,
									)
								}
							>
								<option value="adaptive">adaptive</option>
								<option value="force_mobile">force_mobile</option>
								<option value="force_mobile_compact">force_mobile_compact</option>
							</NativeSelect>
						</FormItem>
						<div className="host-debug__grid">
							<FormItem top="Viewport width">
								<Input
									type="number"
									value={String(snapshot.viewportWidth)}
									onChange={event =>
										actions.setAdaptivity(snapshot.adaptivity, {
											width: Number(event.target.value),
										})
									}
								/>
							</FormItem>
							<FormItem top="Height">
								<Input
									type="number"
									value={String(snapshot.viewportHeight)}
									onChange={event =>
										actions.setAdaptivity(snapshot.adaptivity, {
											height: Number(event.target.value),
										})
									}
								/>
							</FormItem>
						</div>
						<div className="host-debug__grid">
							{(["top", "right", "bottom", "left"] as const).map(side => (
								<FormItem key={side} top={`Inset ${side}`}>
									<Input
										type="number"
										value={String(snapshot.insets[side] ?? 0)}
										onChange={event =>
											actions.setInsets({
												[side]: Number(event.target.value),
											})
										}
									/>
								</FormItem>
							))}
						</div>
						<div className="host-debug__grid">
							<FormItem top="Latency, ms">
								<Input
									type="number"
									min={0}
									value={String(snapshot.latencyMs)}
									onChange={event =>
										actions.setLatency(Number(event.target.value))
									}
								/>
							</FormItem>
							<FormItem top="Next outcome">
								<NativeSelect
									aria-label="Host outcome"
									value={snapshot.outcome}
									onChange={event =>
										actions.setOutcome(
											event.target.value as typeof snapshot.outcome,
										)
									}
								>
									<option value="success">success</option>
									<option value="error">error</option>
									<option value="denied">denied</option>
								</NativeSelect>
							</FormItem>
						</div>
						<FormItem top="Host-initiated ChangeFragment">
							<div className="host-debug__jump">
								<Input
									value={jumpTarget}
									onChange={event => setJumpTarget(event.target.value)}
									aria-label="Host jump target"
								/>
								<Button onClick={() => actions.hostJump(jumpTarget)}>Jump</Button>
							</div>
						</FormItem>
						<BoxedButtons>
							<Button
								size="s"
								mode="secondary"
								onClick={() => actions.resendLocation()}
							>
								Повторить location (echo)
							</Button>
							<Button
								size="s"
								mode="secondary"
								onClick={() => actions.clearStorage()}
							>
								Очистить fake Storage
							</Button>
							<Button size="s" mode="secondary" onClick={() => actions.reset()}>
								Сбросить host controls
							</Button>
						</BoxedButtons>
						<Footnote style={{ padding: "0 12px 8px" }}>
							Storage: {JSON.stringify(snapshot.storage)}
						</Footnote>
					</>
				)}
				<BoxedButtons>
					<Button size="s" mode="secondary" href="/__vkma/" target="_blank">
						Открыть devtools
					</Button>
					<Button
						size="s"
						mode="secondary"
						onClick={() => window.open(window.location.href, "_blank")}
					>
						Вторая вкладка
					</Button>
					<Button size="s" mode="tertiary" onClick={() => setDebugArmed(false)}>
						Скрыть lab
					</Button>
				</BoxedButtons>
			</Group>
		</aside>
	);
}

function BoxedButtons({ children }: { children: ReactNode }): ReactElement {
	return (
		<ButtonGroup gap="s" style={{ flexWrap: "wrap", padding: "4px 12px 12px" }}>
			{children}
		</ButtonGroup>
	);
}
