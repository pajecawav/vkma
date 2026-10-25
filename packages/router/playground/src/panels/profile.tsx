import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelSearch } from "@vkma.dev/router/react";
import {
	Icon28EditOutline,
	Icon28SettingsOutline,
	Icon28UserCircleOutline,
} from "@vkontakte/icons";
import {
	CellButton,
	Caption,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	SimpleCell,
	Switch,
	Tabs,
	TabsItem,
	Title,
} from "@vkontakte/vkui";
import { app } from "../app";
import { users } from "../data";
import { InitialsAvatar } from "../ui";

const me = users["anna"]!;

export function ProfilePanel() {
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

export interface SettingsSearch {
	section?: "privacy";
}

export function ProfileSettingsPanel() {
	const navigator = useNavigator();
	const search = usePanelSearch(app.panels["profile/settings"]);
	const privacy = search?.section === "privacy";

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				{privacy ? "Приватность" : "Редактирование"}
			</PanelHeader>
			<Group>
				<Tabs>
					<TabsItem
						selected={!privacy}
						onClick={() => void navigator.replace({ to: "/settings", search: {} })}
					>
						Профиль
					</TabsItem>
					<TabsItem
						selected={privacy}
						onClick={() =>
							void navigator.replace({
								to: "/settings",
								search: { section: "privacy" },
							})
						}
					>
						Приватность
					</TabsItem>
				</Tabs>
			</Group>
			{privacy ? (
				<Group header={<Header size="s">Кто видит мою страницу</Header>}>
					<SimpleCell Component="label" after={<Switch defaultChecked />}>
						Фотографии
					</SimpleCell>
					<SimpleCell Component="label" after={<Switch />}>
						Друзья
					</SimpleCell>
					<SimpleCell Component="label" after={<Switch defaultChecked />}>
						Статус «онлайн»
					</SimpleCell>
				</Group>
			) : (
				<Group header={<Header size="s">Основное</Header>}>
					<SimpleCell Component="label" after={<Switch defaultChecked />}>
						Показывать дату рождения
					</SimpleCell>
					<SimpleCell Component="label" after={<Switch />}>
						Подписки на авторов
					</SimpleCell>
				</Group>
			)}
			<Group>
				<CellButton appearance="negative" onClick={() => navigator.showPopout("logout")}>
					Выйти из аккаунта (попаут)
				</CellButton>
			</Group>
		</>
	);
}
