import {
	ModalCardSurface,
	useModalProps,
	useNavigator,
	usePanelParams,
} from "@vkma.dev/router/preset";
import { Box, Button, ButtonGroup, Text } from "@vkontakte/vkui";
import { useState, type ReactElement } from "react";
import { shareMeeting } from "../../bridge-actions";
import { meetingOf } from "../../store";
import { meetingPanel } from "./plans.panel";

export default function ShareMeetingCard(): ReactElement {
	const { id } = usePanelParams(meetingPanel);
	const { note } = useModalProps<{ note?: string }>() ?? {};
	const navigator = useNavigator();
	const [sending, setSending] = useState(false);
	const meeting = meetingOf(id);

	const share = async (): Promise<void> => {
		setSending(true);
		const shared = await shareMeeting(meeting);
		setSending(false);
		if (shared) {
			navigator.hideModal();
		}
	};

	return (
		<ModalCardSurface
			title="Поделиться встречей"
			description={note ?? "Выберите получателя в VK или мессенджер"}
			actions={
				<ButtonGroup stretched gap="s">
					<Button size="l" stretched loading={sending} onClick={() => void share()}>
						Выбрать получателя
					</Button>
					<Button
						size="l"
						mode="secondary"
						stretched
						disabled={sending}
						onClick={() => navigator.hideModal()}
					>
						Отмена
					</Button>
				</ButtonGroup>
			}
		>
			<Box padding="m" style={{ textAlign: "center" }}>
				<Text weight="2">{meeting.title}</Text>
				<Text
					style={{
						marginTop: 8,
						color: "var(--vkui--color_text_secondary)",
					}}
				>
					{meeting.day} · {meeting.time} · {meeting.place}
				</Text>
			</Box>
		</ModalCardSurface>
	);
}
