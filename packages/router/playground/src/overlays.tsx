import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelParams } from "@vkma.dev/router/react";
import {
	Alert,
	CellButton,
	Footer,
	Group,
	Header,
	ModalPageHeader,
	PanelHeaderClose,
	RichCell,
	SimpleCell,
	Switch,
	Text,
} from "@vkontakte/vkui";
import { posts, users } from "./data";
import { app } from "./routes";
import { InitialsAvatar } from "./ui";

/**
 * Overlay components. Route modals render inside the host's ModalPage
 * (the sheet itself is not ours), popouts render into the Popouts host.
 */

export function CommentsModal() {
	const navigator = useNavigator();
	const { id = "1" } = usePanelParams(app.panels["feed/post/$id"]!.routeId);
	const post = posts.find(candidate => candidate.id === Number(id)) ?? posts[0]!;

	return (
		<>
			<ModalPageHeader before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}>
				Комментарии · {post.comments.length}
			</ModalPageHeader>
			<Group>
				{post.comments.map(comment => {
					const commenter = users[comment.authorId]!;
					return (
						<RichCell
							key={comment.id}
							before={
								<InitialsAvatar
									name={commenter.name}
									color={commenter.color}
									size={36}
								/>
							}
							subtitle={comment.time}
						>
							{commenter.name}
							<Text
								style={{ marginTop: 4, color: "var(--vkui--color_text_secondary)" }}
							>
								{comment.text}
							</Text>
						</RichCell>
					);
				})}
				{post.comments.length === 0 && <Footer>Пока тихо</Footer>}
			</Group>
			<Group>
				<CellButton
					subtitle="модалка на модалке: назад — сразу на панель"
					onClick={() =>
						void navigator.showModal({ to: "/post/$id/thread", params: { id } })
					}
				>
					Открыть тред
				</CellButton>
			</Group>
		</>
	);
}

export function ThreadModal() {
	const navigator = useNavigator();
	return (
		<>
			<ModalPageHeader before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}>
				Тред
			</ModalPageHeader>
			<Group header={<Header size="s">Второй уровень</Header>}>
				<SimpleCell>
					Ветка ответов. Первая шторка закрылась со своей анимацией — и только потом
					открылась эта.
				</SimpleCell>
			</Group>
		</>
	);
}

export function SettingsGlobalModal() {
	const navigator = useNavigator();
	return (
		<>
			<ModalPageHeader before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}>
				Настройки
			</ModalPageHeader>
			<Group>
				<SimpleCell Component="label" after={<Switch defaultChecked />}>
					Push-уведомления
				</SimpleCell>
				<SimpleCell Component="label" after={<Switch />}>
					Тёмная тема (системная)
				</SimpleCell>
				<SimpleCell Component="label" after={<Switch defaultChecked />}>
					Звуки
				</SimpleCell>
			</Group>
			<Group>
				<Footer>
					глобальная модалка ?modal=settings — открыта с любой панели, URL замаскирован
				</Footer>
			</Group>
		</>
	);
}

export function LogoutPopout({ onClose }: { onClose: () => void }) {
	return (
		<Alert
			title="Выйти из аккаунта?"
			description="Черновики останутся на устройстве."
			actions={[
				{ title: "Отмена", mode: "cancel", action: onClose },
				{ title: "Выйти", mode: "destructive", action: onClose },
			]}
			onClose={onClose}
			onClosed={onClose}
		/>
	);
}
