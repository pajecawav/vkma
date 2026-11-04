import { Icon28Notifications } from "@vkontakte/icons";
import {
	Cell,
	Footer,
	Group,
	Panel,
	PanelHeader,
	PanelHeaderBack,
	SimpleCell,
	View,
} from "@vkontakte/vkui";
import { useState } from "react";

/** The "more" story: a menu screen and one nested scenario with back navigation. */
export function MoreView({ id }: { id: string }) {
	const [activePanel, setActivePanel] = useState("more");

	return (
		<View id={id} activePanel={activePanel}>
			<Panel id="more">
				<PanelHeader>Ещё</PanelHeader>
				<Group>
					<Cell
						before={<Icon28Notifications />}
						chevron="always"
						onClick={() => setActivePanel("notifications")}
					>
						Уведомления
					</Cell>
				</Group>
				<Group>
					<Footer>структура повторяет гайд по навигации VKUI</Footer>
				</Group>
			</Panel>
			<Panel id="notifications">
				<PanelHeader before={<PanelHeaderBack onClick={() => setActivePanel("more")} />}>
					Уведомления
				</PanelHeader>
				<Group>
					<SimpleCell subtitle="вложенный сценарий">Пока ничего нового</SimpleCell>
				</Group>
			</Panel>
		</View>
	);
}
