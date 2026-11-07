import { createVkLink, useNavigator, usePanelLoaderData } from "@vkma.dev/router/preset";
import {
	Icon28FavoriteOutline,
	Icon28InfoCircleOutline,
	Icon28SettingsOutline,
	Icon28SlidersOutline,
} from "@vkontakte/icons";
import {
	Box,
	Caption,
	Cell,
	CellButton,
	Footer,
	Group,
	Header,
	PanelHeader,
	PanelSpinner,
	SimpleCell,
	Title,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { addAppToFavorites } from "../../bridge-actions";
import { InitialsAvatar } from "../../ui";
import { aboutPanel, profilePanel, profileSettingsPanel } from "./profile.panel";

const CellLink = createVkLink(Cell);

export default function ProfilePanel(): ReactElement {
	const navigator = useNavigator();
	const loaderData = usePanelLoaderData(profilePanel);

	if (loaderData === undefined) {
		return (
			<>
				<PanelHeader>Профиль</PanelHeader>
				<PanelSpinner size="l" />
			</>
		);
	}

	const { user, error } = loaderData;
	const name = user === null ? "Профиль VK" : `${user.first_name} ${user.last_name}`.trim();

	return (
		<>
			<PanelHeader>Профиль</PanelHeader>
			{user !== null ? (
				<Group>
					<Box
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 8,
							padding: "28px 16px 20px",
						}}
					>
						<InitialsAvatar name={name} size={80} />
						<Title level="2">{name || "Профиль VK"}</Title>
						<Caption style={{ color: "var(--vkui--color_text_secondary)" }}>
							VK ID {user.id}
						</Caption>
					</Box>
				</Group>
			) : (
				<Group>
					<SimpleCell multiline subtitle={error ?? "Host не вернул данные пользователя"}>
						Не удалось загрузить профиль VK
					</SimpleCell>
				</Group>
			)}
			<Group header={<Header size="s">Приложение</Header>}>
				<CellLink
					before={<Icon28SettingsOutline />}
					chevron="always"
					page={profileSettingsPanel}
				>
					Настройки
				</CellLink>
				<CellButton
					before={<Icon28SlidersOutline />}
					subtitle="Те же настройки в глобальном модальном окне"
					onClick={() => void navigator.showGlobalModal("settings")}
				>
					Быстрые настройки
				</CellButton>
				<CellLink before={<Icon28InfoCircleOutline />} chevron="always" page={aboutPanel}>
					О приложении
				</CellLink>
			</Group>
			<Group header={<Header size="s">VK</Header>}>
				<CellButton
					before={<Icon28FavoriteOutline />}
					onClick={() => void addAppToFavorites()}
				>
					Добавить в избранное
				</CellButton>
			</Group>
			<Group>
				<Footer>
					Профиль получен через VKWebAppGetUserInfo. Результат loader кешируется на
					минуту.
				</Footer>
			</Group>
		</>
	);
}
