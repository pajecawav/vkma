import { useNavigator } from "@vkma.dev/router/preset";
import {
	Group,
	PanelHeader,
	Search,
	Footer,
	Counter,
	Caption,
	SimpleCell,
	Flex,
} from "@vkontakte/vkui";
import { useState } from "react";
import { chatTitleOf, chats, users } from "../data";
import { InitialsAvatar } from "../ui";

export function ChatsPanel() {
	const navigator = useNavigator();
	const [query, setQuery] = useState("");
	const filtered = chats.filter(chat =>
		chatTitleOf(chat).toLowerCase().includes(query.trim().toLowerCase()),
	);

	return (
		<>
			<PanelHeader>Сообщения</PanelHeader>
			<Group>
				<Search
					value={query}
					onChange={event => setQuery(event.target.value)}
					placeholder="Поиск сообщений"
				/>

				{filtered.map(chat => {
					const user = users[chat.userId]!;
					return (
						<SimpleCell
							key={chat.id}
							before={<InitialsAvatar name={user.name} size={48} />}
							subtitle={chat.lastMessage}
							onClick={() =>
								void navigator.push({ to: "/chat/$id", params: { id: chat.id } })
							}
							after={
								<Flex direction="column" align="end">
									<Caption style={{ color: "var(--vkui--color_text_secondary)" }}>
										{chat.time}
									</Caption>
									{chat.unread > 0 && (
										<Counter size="s" mode="primary" appearance="accent-red">
											{chat.unread}
										</Counter>
									)}
								</Flex>
							}
						>
							{user.name}
						</SimpleCell>
					);
				})}
				{filtered.length === 0 && <Footer>Никого не нашли</Footer>}
			</Group>
		</>
	);
}
