import { useNavigator } from "@vkma.dev/router/preset";
import { Group, PanelHeader, RichCell, Search, Footer, Counter, Caption } from "@vkontakte/vkui";
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
			<Search
				value={query}
				onChange={event => setQuery(event.target.value)}
				placeholder="Поиск сообщений"
			/>
			<Group>
				{filtered.map(chat => {
					const user = users[chat.userId]!;
					return (
						<RichCell
							key={chat.id}
							before={
								<InitialsAvatar name={user.name} color={user.color} size={48} />
							}
							subtitle={chat.lastMessage}
							onClick={() =>
								void navigator.push({ to: "/chat/$id", params: { id: chat.id } })
							}
							after={
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										alignItems: "flex-end",
										gap: 4,
									}}
								>
									<Caption style={{ color: "var(--vkui--color_text_secondary)" }}>
										{chat.time}
									</Caption>
									{chat.unread > 0 && (
										<Counter size="s" mode="primary" appearance="accent-red">
											{chat.unread}
										</Counter>
									)}
								</div>
							}
						>
							{user.name}
						</RichCell>
					);
				})}
				{filtered.length === 0 && <Footer>Никого не нашли</Footer>}
			</Group>
		</>
	);
}
