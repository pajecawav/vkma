import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelSearch } from "@vkma.dev/router/react";
import {
	CellButton,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	SimpleCell,
	Switch,
	Tabs,
	TabsItem,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { profileSettingsPanel } from "./profile.panel";

export default function ProfileSettingsPanel(): ReactElement {
	const navigator = useNavigator();
	const search = usePanelSearch(profileSettingsPanel);
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
						aria-controls="settings-tab-content"
						onClick={() => void navigator.replace({ to: "/settings", search: {} })}
					>
						Профиль
					</TabsItem>
					<TabsItem
						selected={privacy}
						aria-controls="settings-tab-content"
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
			<div id="settings-tab-content">
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
					<CellButton
						appearance="negative"
						subtitle="попаут поверх панели"
						onClick={() => navigator.showPopout("logout")}
					>
						Выйти из аккаунта
					</CellButton>
				</Group>
			</div>
		</>
	);
}
