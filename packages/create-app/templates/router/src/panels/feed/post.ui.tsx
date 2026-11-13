import { createVkLink, useNavigator } from "@vkma.dev/router/preset";
import { usePanelParams } from "@vkma.dev/router/react";
import { Group, Header, PanelHeader, PanelHeaderBack, RichCell, Text } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { postOf } from "../../data";
import { postPanel } from "./feed.panel";

const RichCellLink = createVkLink(RichCell);

export default function PostPanel(): ReactElement {
	const navigator = useNavigator();
	// typed params straight from the "$id" path segment of the handle
	const { id } = usePanelParams(postPanel);
	const post = postOf(id);

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.backToFirst()} />}>
				Запись
			</PanelHeader>
			<Group>
				<RichCell subtitle={post.author}>{post.text}</RichCell>
			</Group>
			<Group header={<Header size="s">Комментарии ({post.comments.length})</Header>}>
				{post.comments.map(comment => (
					<RichCell key={comment} multiline>
						<Text style={{ color: "var(--vkui--color_text_secondary)" }}>
							{comment}
						</Text>
					</RichCell>
				))}
			</Group>
			<Group>
				<RichCell
					subtitle="модалка-маршрут: params и props проверяются по хендлу"
					onClick={() =>
						void navigator.showModal(postPanel.modals.share, {
							params: { id },
							props: { note: "Ссылка откроет именно эту запись" },
						})
					}
				>
					Поделиться записью
				</RichCell>
				<RichCellLink
					subtitle="та же панель, новый параметр"
					page={postPanel}
					params={{ id: String(post.id + 1) }}
				>
					Следующая запись
				</RichCellLink>
			</Group>
		</>
	);
}
