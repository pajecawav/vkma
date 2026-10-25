import { useNavigator } from "@vkma.dev/router/preset";
import { Footer, Group, PanelHeader, PanelHeaderBack, SimpleCell } from "@vkontakte/vkui";

export default function AboutPanel() {
	const navigator = useNavigator();
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				О приложении
			</PanelHeader>
			<Group>
				<Group mode="plain">
					<SimpleCell indicator="0.1.0">Версия</SimpleCell>
					<SimpleCell indicator="Русский">Язык приложения</SimpleCell>
					<Footer>
						Витрина @vkma.dev/router: панели, модалки-маршруты, попауты, инфлейт.
					</Footer>
				</Group>
			</Group>
		</>
	);
}
