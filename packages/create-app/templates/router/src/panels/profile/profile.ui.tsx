import bridge from "@vkma.dev/bridge";
import { createVkLink, useNavigator } from "@vkma.dev/router/preset";
import { Avatar, Caption, CellButton, Group, Header, PanelHeader, Title } from "@vkontakte/vkui";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { profileSettingsPanel } from "./profile.panel";

const CellButtonLink = createVkLink(CellButton);

async function fetchUser() {
	return bridge.send("VKWebAppGetUserInfo");
}

/** The lazy panel chunk: split out of the main bundle, resolved on match. */
export default function ProfilePanel(): ReactElement {
	const navigator = useNavigator();
	const [user, setUser] = useState<Awaited<ReturnType<typeof fetchUser>> | null>(null);

	useEffect(() => {
		void fetchUser().then(setUser, () => setUser(null));
	}, []);

	return (
		<>
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
			<Group header={<Header size="s">Навигация</Header>}>
				<CellButtonLink
					subtitle="router link — панель прогреется до тапа"
					page={profileSettingsPanel}
				>
					Настройки профиля
				</CellButtonLink>
				<CellButton
					subtitle="глобальная модалка — с любой панели"
					onClick={() => void navigator.showGlobalModal("settings")}
				>
					Настройки приложения
				</CellButton>
			</Group>
		</>
	);
}
