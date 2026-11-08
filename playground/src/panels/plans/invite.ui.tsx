import bridge from "@vkma.dev/bridge";
import { ModalPageSurface, useNavigator, usePanelParams } from "@vkma.dev/router/preset";
import {
	Button,
	Footer,
	Group,
	ModalPageHeader,
	PanelHeaderClose,
	PanelSpinner,
	Placeholder,
	SimpleCell,
} from "@vkontakte/vkui";
import { useState, type ReactElement } from "react";
import { showInviteBox } from "../../bridge-actions";
import { errorText, meetingOf } from "../../store";
import { InitialsAvatar } from "../../ui";
import { meetingPanel } from "./plans.panel";

type Friend = Awaited<ReturnType<typeof bridge.send<"VKWebAppGetFriends">>>["users"][number];
type FriendsState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; friends: Friend[] };

export default function InviteModal(): ReactElement {
	const navigator = useNavigator();
	const { id } = usePanelParams(meetingPanel);
	const meeting = meetingOf(id);
	const [friendsState, setFriendsState] = useState<FriendsState>({ status: "idle" });
	const [inviting, setInviting] = useState(false);

	const loadFriends = async (): Promise<void> => {
		setFriendsState({ status: "loading" });
		try {
			const { users } = await bridge.send("VKWebAppGetFriends", { multi: true });
			setFriendsState({ status: "ready", friends: users });
		} catch (error) {
			setFriendsState({ status: "error", message: errorText(error) });
		}
	};

	const invite = async (): Promise<void> => {
		setInviting(true);
		await showInviteBox();
		setInviting(false);
	};

	return (
		<ModalPageSurface
			hideCloseButton
			header={
				<ModalPageHeader
					before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}
				>
					Пригласить друзей
				</ModalPageHeader>
			}
		>
			<Group>
				<Footer>{meeting.title} · список друзей из VK</Footer>
				{friendsState.status === "idle" && (
					<Placeholder
						title="Кого позвать?"
						action={
							<Button onClick={() => void loadFriends()}>Загрузить друзей VK</Button>
						}
					>
						Список друзей VK загрузится по вашему действию.
					</Placeholder>
				)}
				{friendsState.status === "loading" && <PanelSpinner />}
				{friendsState.status === "error" && (
					<Placeholder
						title="Список друзей недоступен"
						action={
							<Button onClick={() => void loadFriends()}>Попробовать снова</Button>
						}
					>
						{friendsState.message}. Проверьте разрешение на список друзей или попробуйте
						позже.
					</Placeholder>
				)}
				{friendsState.status === "ready" && friendsState.friends.length === 0 && (
					<Placeholder title="Некого пригласить">
						Список друзей VK пуст или недоступен.
					</Placeholder>
				)}
				{friendsState.status === "ready" &&
					friendsState.friends.map(friend => (
						<SimpleCell
							key={friend.id}
							before={
								<InitialsAvatar
									name={`${friend.first_name} ${friend.last_name}`}
									size={40}
								/>
							}
						>
							{friend.first_name} {friend.last_name}
						</SimpleCell>
					))}
			</Group>
			<Group>
				<Button size="l" stretched loading={inviting} onClick={() => void invite()}>
					Выбрать знакомых в VK
				</Button>
			</Group>
		</ModalPageSurface>
	);
}
