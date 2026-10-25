import { useNavigator } from "@vkma.dev/router/preset";
import {
	Icon28EditOutline,
	Icon28SettingsOutline,
	Icon28UserCircleOutline,
} from "@vkontakte/icons";
import { CellButton, Caption, Group, Header, PanelHeader, Title } from "@vkontakte/vkui";
import { users } from "../../data";
import { InitialsAvatar } from "../../ui";

const me = users["anna"]!;

export default function ProfilePanel() {
	const navigator = useNavigator();
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
					<InitialsAvatar name={me.name} size={72} />
					<Title level="2">{me.name}</Title>
					<Caption style={{ color: "var(--vkui--color_text_secondary)" }}>
						онлайн · Москва
					</Caption>
				</div>
			</Group>
			<Group header={<Header size="s">Аккаунт</Header>}>
				<CellButton
					before={<Icon28EditOutline />}
					onClick={() => void navigator.push({ to: "/settings" })}
				>
					Редактировать профиль
				</CellButton>
				<CellButton
					before={<Icon28UserCircleOutline />}
					onClick={() =>
						void navigator.push({ to: "/settings", search: { section: "privacy" } })
					}
				>
					Приватность (?section=privacy)
				</CellButton>
			</Group>
			<Group header={<Header size="s">Приложение</Header>}>
				<CellButton
					before={<Icon28SettingsOutline />}
					onClick={() => void navigator.showGlobalModal("settings")}
				>
					Настройки (глобальная модалка)
				</CellButton>
			</Group>
		</>
	);
}
