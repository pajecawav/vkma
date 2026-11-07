import {
	ModalPageSurface,
	useEnableSwipeBack,
	useNavigator,
	type PanelRef,
} from "@vkma.dev/router/preset";
import {
	Button,
	FormItem,
	FormLayoutGroup,
	Input,
	ModalPageHeader,
	PanelHeaderClose,
	Textarea,
} from "@vkontakte/vkui";
import { useState, type FormEvent, type ReactElement } from "react";
import type { MeetingInput } from "../../data";

interface MeetingFormProps {
	panel: PanelRef;
	title: string;
	initial?: MeetingInput;
	submitLabel: string;
	onSave: (input: MeetingInput) => void;
}

const EMPTY_MEETING: MeetingInput = {
	title: "",
	description: "",
	day: "Сегодня",
	time: "12:00–13:00",
	place: "",
};

export function MeetingForm({
	panel,
	title,
	initial = EMPTY_MEETING,
	submitLabel,
	onSave,
}: MeetingFormProps): ReactElement {
	const navigator = useNavigator();
	const [input, setInput] = useState<MeetingInput>(initial);
	useEnableSwipeBack(false, panel);

	const update = (field: keyof MeetingInput, value: string): void => {
		setInput(current => ({ ...current, [field]: value }));
	};
	const submit = (event: FormEvent): void => {
		event.preventDefault();
		onSave(input);
		navigator.hideModal();
	};

	return (
		<ModalPageSurface
			hideCloseButton
			header={
				<ModalPageHeader
					before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}
				>
					{title}
				</ModalPageHeader>
			}
		>
			<form onSubmit={submit}>
				<FormLayoutGroup mode="vertical">
					<FormItem top="Название" required>
						<Input
							value={input.title}
							onChange={event => update("title", event.target.value)}
							placeholder="Например, разбор макетов"
							required
							maxLength={80}
						/>
					</FormItem>
					<FormItem top="Описание">
						<Textarea
							value={input.description}
							onChange={event => update("description", event.target.value)}
							placeholder="Повестка, ссылки или договорённости"
							rows={3}
						/>
					</FormItem>
					<FormItem top="День" required>
						<Input
							value={input.day}
							onChange={event => update("day", event.target.value)}
							required
						/>
					</FormItem>
					<FormItem top="Время" required>
						<Input
							value={input.time}
							onChange={event => update("time", event.target.value)}
							required
						/>
					</FormItem>
					<FormItem top="Место" required>
						<Input
							value={input.place}
							onChange={event => update("place", event.target.value)}
							placeholder="Переговорная или ссылка на звонок"
							required
						/>
					</FormItem>
					<FormItem>
						<Button size="l" stretched type="submit">
							{submitLabel}
						</Button>
					</FormItem>
				</FormLayoutGroup>
			</form>
		</ModalPageSurface>
	);
}
