import { useNavigator, usePanelSearch } from "@vkma.dev/router/preset";
import { Icon28DeleteOutline, Icon28SlidersOutline } from "@vkontakte/icons";
import {
	CellButton,
	Footer,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	SimpleCell,
} from "@vkontakte/vkui";
import { useEffect, type ReactElement } from "react";
import { profileSettingsPanel } from "./profile.panel";
import { SettingsControls } from "./settings-controls";

export default function ProfileSettingsPanel(): ReactElement {
	const navigator = useNavigator();
	const section = usePanelSearch(profileSettingsPanel)?.section;

	useEffect(() => {
		if (section === "privacy") {
			document.getElementById("planner-privacy")?.scrollIntoView({ block: "start" });
		}
	}, [section]);

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				Настройки
			</PanelHeader>
			<SettingsControls />
			<Group header={<Header size="s">Дополнительно</Header>}>
				<CellButton
					before={<Icon28SlidersOutline />}
					subtitle="Глобальная модалка поверх текущей панели"
					onClick={() => void navigator.showGlobalModal("settings")}
				>
					Открыть быстрые настройки
				</CellButton>
				{section !== "privacy" && (
					<CellButton
						subtitle="Typed search: ?section=privacy"
						onClick={() =>
							void navigator.push({
								to: "/settings",
								search: { section: "privacy" },
							})
						}
					>
						Перейти к данным и приватности
					</CellButton>
				)}
			</Group>
			<Group
				id="planner-privacy"
				header={
					<Header
						size="s"
						subtitle={
							section === "privacy" ? "Раздел открыт по прямой ссылке" : undefined
						}
					>
						Данные и приватность
					</Header>
				}
			>
				<SimpleCell
					multiline
					subtitle="Встречи и приглашения живут в памяти playground. Три настройки выше сохраняются в VK Storage; сброс не удаляет их."
				>
					Как хранятся данные
				</SimpleCell>
				<CellButton
					before={<Icon28DeleteOutline />}
					appearance="negative"
					onClick={() => navigator.showPopout("reset")}
				>
					Сбросить встречи и приглашения
				</CellButton>
			</Group>
			<Group>
				<Footer>Сброс восстанавливает исходные fixtures и не меняет профиль VK.</Footer>
			</Group>
		</>
	);
}
