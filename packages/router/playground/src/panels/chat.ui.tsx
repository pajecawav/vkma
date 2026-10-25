import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelParams } from "@vkma.dev/router/react";
import { Icon28BlockOutline } from "@vkontakte/icons";
import {
	CellButton,
	Footer,
	Group,
	PanelHeader,
	PanelHeaderBack,
	Placeholder,
	Text,
	WriteBar,
	WriteBarIcon,
} from "@vkontakte/vkui";
import type { ComponentType } from "react";
import { app } from "../app";
import { chatTitleOf, chats } from "../data";

/** Lazy chat screen — deep-linkable (#/chat/anna inflates the chain). */

export const chatLazy = async (_routeId: string): Promise<{ component: ComponentType }> => ({
	component: ChatPanel,
});

function ChatPanel() {
	const navigator = useNavigator();
	const { id } = usePanelParams(app.panels["messages/chat/$id"]);
	const chat = chats.find(candidate => candidate.id === id);

	if (chat === undefined) {
		return (
			<>
				<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
					Чат
				</PanelHeader>
				<Placeholder title="Чат не найден">Возможно, он был удалён.</Placeholder>
			</>
		);
	}

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				{chatTitleOf(chat)}
			</PanelHeader>
			<Group>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 8,
						padding: "12px 16px 4px",
					}}
				>
					{chat.messages.map((message, i) => (
						<div
							key={i}
							style={{
								alignSelf: message.out ? "flex-end" : "flex-start",
								maxWidth: "82%",
								padding: "8px 12px",
								borderRadius: message.out
									? "14px 14px 4px 14px"
									: "14px 14px 14px 4px",
								background: message.out
									? "var(--vkui--color_background_accent_tinted)"
									: "var(--vkui--color_background_secondary)",
							}}
						>
							<Text>{message.text}</Text>
							<Text
								style={{
									display: "block",
									marginTop: 2,
									fontSize: 11,
									color: "var(--vkui--color_text_secondary)",
									textAlign: "right",
								}}
							>
								{message.time}
							</Text>
						</div>
					))}
				</div>

				<Footer style={{ paddingTop: 8 }}>
					глубокая ссылка #/chat/{chat.id} — инфлейт цепочки
				</Footer>

				<WriteBar
					placeholder="Сообщение"
					aria-label="Сообщение"
					before={<WriteBarIcon mode="attach" />}
					after={<WriteBarIcon mode="send" />}
				/>
			</Group>
			<Group>
				<CellButton
					before={<Icon28BlockOutline />}
					onClick={() => void navigator.push({ to: "/chat/$id", params: { id: "bot" } })}
				>
					Пожаловаться (redirect из beforeLoad)
				</CellButton>
			</Group>
		</>
	);
}
