import { createVkLink } from "@vkma.dev/router/preset";
import { Group, Header, PanelHeader, RichCell, Text } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { POSTS } from "../../data";
import { postPanel } from "./feed.panel";

const RichCellLink = createVkLink(RichCell);

export default function FeedPanel(): ReactElement {
	return (
		<>
			<PanelHeader>Лента</PanelHeader>
			<Group header={<Header size="s">Записи</Header>}>
				{POSTS.map(post => (
					<RichCellLink
						key={post.id}
						multiline
						subtitle={post.author}
						page={postPanel}
						params={{ id: String(post.id) }}
					>
						<Text
							style={{
								marginTop: 4,
								color: "var(--vkui--color_text_secondary)",
							}}
						>
							{post.text}
						</Text>
					</RichCellLink>
				))}
			</Group>
		</>
	);
}
