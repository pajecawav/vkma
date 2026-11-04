import { ModalPageSurface, useNavigator } from "@vkma.dev/router/preset";
import { Group, Header, ModalPageHeader, PanelHeaderClose, SimpleCell } from "@vkontakte/vkui";
import type { ReactElement } from "react";

/** Route-modal chunk of the post panel, the second-level thread page. */
export default function ThreadModal(): ReactElement {
	const navigator = useNavigator();
	return (
		<ModalPageSurface
			header={
				<ModalPageHeader
					before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}
				>
					Тред
				</ModalPageHeader>
			}
		>
			<Group header={<Header size="s">Второй уровень</Header>}>
				<SimpleCell>
					Ветка ответов. Первая шторка закрылась со своей анимацией — и только потом
					открылась эта.
				</SimpleCell>
			</Group>
		</ModalPageSurface>
	);
}
