import { useNavigator } from "@vkma.dev/router/preset";
import { Group, Header, PanelHeader, RichCell, Text } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { POSTS } from "../../data";
import { postPanel } from "./feed.panel";

export default function FeedPanel(): ReactElement {
	const navigator = useNavigator();

	return (
		<>
			<PanelHeader>Лента</PanelHeader>
			<Group header={<Header size="s">Записи</Header>}>
				{POSTS.map(post => (
					<RichCell
						key={post.id}
						multiline
						subtitle={post.author}
						onClick={() => void navigator.push(postPanel, { id: String(post.id) })}
					>
						<Text
							style={{
								marginTop: 4,
								color: "var(--vkui--color_text_secondary)",
							}}
						>
							{post.text}
						</Text>
					</RichCell>
				))}
			</Group>
		</>
	);
}
