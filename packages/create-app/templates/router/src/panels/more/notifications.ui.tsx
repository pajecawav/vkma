import { useNavigator } from "@vkma.dev/router/preset";
import { Group, PanelHeader, PanelHeaderBack, SimpleCell } from "@vkontakte/vkui";
import type { ReactElement } from "react";

export default function NotificationsPanel(): ReactElement {
	const navigator = useNavigator();

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				Уведомления
			</PanelHeader>
			<Group>
				<SimpleCell subtitle="вложенный сценарий, глубокая ссылка /notifications">
					Пока ничего нового
				</SimpleCell>
			</Group>
		</>
	);
}
