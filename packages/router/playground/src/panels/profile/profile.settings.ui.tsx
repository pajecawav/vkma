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
import { useState } from "react";
import { profileSettingsPanel } from "./profile.panel";

export default function ProfileSettingsPanel(): ReactElement {
	const navigator = useNavigator();
	const search = usePanelSearch(profileSettingsPanel);
	const privacy = search?.section === "privacy";
	// demo toggles keep local state — a settings switch that refuses to flip
	// reads as a broken app, not a demo
	const [toggles, setToggles] = useState<Record<string, boolean>>({
		photos: true,
		friends: false,
		online: true,
		birthday: true,
		subscriptions: false,
	});
	const flip = (key: string) => () =>
		setToggles(current => ({ ...current, [key]: !current[key] }));

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
						<SimpleCell
							Component="label"
							after={<Switch checked={toggles["photos"]} onChange={flip("photos")} />}
						>
							Фотографии
						</SimpleCell>
						<SimpleCell
							Component="label"
							after={
								<Switch checked={toggles["friends"]} onChange={flip("friends")} />
							}
						>
							Друзья
						</SimpleCell>
						<SimpleCell
							Component="label"
							after={<Switch checked={toggles["online"]} onChange={flip("online")} />}
						>
							Статус «онлайн»
						</SimpleCell>
					</Group>
				) : (
					<Group header={<Header size="s">Основное</Header>}>
						<SimpleCell
							Component="label"
							after={
								<Switch checked={toggles["birthday"]} onChange={flip("birthday")} />
							}
						>
							Показывать дату рождения
						</SimpleCell>
						<SimpleCell
							Component="label"
							after={
								<Switch
									checked={toggles["subscriptions"]}
									onChange={flip("subscriptions")}
								/>
							}
						>
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
