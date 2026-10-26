import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelSearch } from "@vkma.dev/router/react";
import { Icon28ErrorOutline, Icon56MessageMissingOutline } from "@vkontakte/icons";
import {
	Group,
	PanelHeader,
	Search,
	Snackbar,
	Counter,
	Caption,
	SimpleCell,
	Flex,
	Placeholder,
} from "@vkontakte/vkui";
import { useEffect, useState, type ReactElement } from "react";
import { chatTitleOf, chats, users } from "../../data";
import { InitialsAvatar } from "../../ui";
import { chatsPanel } from "./messages.panel";

export default function ChatsPanel(): ReactElement {
	const navigator = useNavigator();
	const search = usePanelSearch(chatsPanel);
	const [query, setQuery] = useState("");
	// the redirect trace lives in typed search; the snackbar is local so it
	// can be dismissed without rewriting the URL
	const [redirectTrace, setRedirectTrace] = useState(search?.redirectedFrom);
	useEffect(() => {
		setRedirectTrace(search?.redirectedFrom);
	}, [search?.redirectedFrom]);
	const filtered = chats.filter(chat =>
		chatTitleOf(chat).toLowerCase().includes(query.trim().toLowerCase()),
	);

	return (
		<>
			<PanelHeader>Сообщения</PanelHeader>
			{redirectTrace !== undefined && (
				<Snackbar
					placement="top"
					before={<Icon28ErrorOutline fill="var(--vkui--color_icon_accent)" />}
					onClose={() => setRedirectTrace(undefined)}
					onClosed={() => {}}
				>
					Redirect из beforeLoad: /chat/{redirectTrace} → /messages
				</Snackbar>
			)}
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
				{filtered.length === 0 && (
					<Placeholder icon={<Icon56MessageMissingOutline />} title="Никого не нашли">
						Попробуйте изменить запрос
					</Placeholder>
				)}
			</Group>
		</>
	);
}
