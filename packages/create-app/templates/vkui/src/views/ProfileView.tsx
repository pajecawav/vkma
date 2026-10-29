import bridge from "@vkma.dev/bridge";
import {
	Avatar,
	CellButton,
	Caption,
	Group,
	Panel,
	PanelHeader,
	PanelHeaderBack,
	SimpleCell,
	Title,
	View,
} from "@vkontakte/vkui";
import { useEffect, useState } from "react";

async function fetchUser() {
	return bridge.send("VKWebAppGetUserInfo");
}

/** The profile story: the user card (a real bridge call) + a nested screen. */
export function ProfileView({ id }: { id: string }) {
	const [activePanel, setActivePanel] = useState("main");
	const [user, setUser] = useState<Awaited<ReturnType<typeof fetchUser>> | null>(null);

	useEffect(() => {
		void fetchUser().then(setUser, () => setUser(null));
	}, []);

	return (
		<View id={id} activePanel={activePanel}>
			<Panel id="main">
				<PanelHeader>Профиль</PanelHeader>
				<Group>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 8,
							padding: "28px 0 20px",
						}}
					>
						<Avatar size={72}>
							{user !== null
								? `${user.first_name.at(0) ?? ""}${user.last_name.at(0) ?? ""}`
								: "…"}
						</Avatar>
						<Title level="2">
							{user !== null ? `${user.first_name} ${user.last_name}` : "Профиль VK"}
						</Title>
						<Caption style={{ color: "var(--vkui--color_text_secondary)" }}>
							данные из VKWebAppGetUserInfo
						</Caption>
					</div>
				</Group>
				<Group>
					<CellButton onClick={() => setActivePanel("settings")}>
						Настройки профиля
					</CellButton>
				</Group>
			</Panel>
			<Panel id="settings">
				<PanelHeader before={<PanelHeaderBack onClick={() => setActivePanel("main")} />}>
					Настройки
				</PanelHeader>
				<Group>
					<SimpleCell>Экран внутри сценария «Профиль»</SimpleCell>
					<SimpleCell subtitle="навигация на локальном состоянии">
						activePanel через useState
					</SimpleCell>
				</Group>
			</Panel>
		</View>
	);
}
