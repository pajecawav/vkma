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
import { resetPopout, settingsModal } from "../../overlays";
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
					subtitle="Быстрое окно настроек поверх текущего экрана"
					onClick={() => void navigator.showGlobalModal(settingsModal)}
				>
					Открыть быстрые настройки
				</CellButton>
				{section !== "privacy" && (
					<CellButton
						subtitle="Быстрый переход к privacy-разделу"
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
					subtitle="Встречи и приглашения живут внутри приложения. Настройки сохраняются и применяются сразу."
				>
					Как хранятся данные
				</SimpleCell>
				<CellButton
					before={<Icon28DeleteOutline />}
					appearance="negative"
					onClick={() => navigator.showPopout(resetPopout)}
				>
					Сбросить встречи и приглашения
				</CellButton>
			</Group>
			<Group style={{ paddingBottom: 72 }}>
				<Footer>Сброс возвращает встречи и настройки в исходные значения.</Footer>
			</Group>
		</>
	);
}
