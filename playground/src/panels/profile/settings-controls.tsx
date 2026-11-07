import { Footer, FormItem, Group, Header, Select, SimpleCell, Switch } from "@vkontakte/vkui";
import { useId, type ReactElement } from "react";
import { saveSettings, usePlannerState, type PlannerSettings } from "../../store";

/** Controlled settings shared by the full panel and the global route modal. */
export function SettingsControls(): ReactElement {
	const filterId = useId();
	const { settings, settingsStatus } = usePlannerState();
	const disabled = settingsStatus === "loading";

	const update = (patch: Partial<PlannerSettings>): void => {
		void saveSettings({ ...settings, ...patch });
	};

	return (
		<>
			<Group header={<Header size="s">Планировщик</Header>}>
				<SimpleCell
					Component="label"
					subtitle="Показывать уведомления о событиях планировщика"
					multiline
					after={
						<Switch
							checked={settings.notifications}
							disabled={disabled}
							aria-label="Уведомления"
							onChange={event => update({ notifications: event.target.checked })}
						/>
					}
				>
					Уведомления
				</SimpleCell>
				<SimpleCell
					Component="label"
					subtitle="Уменьшить расстояние между строками в списке встреч"
					multiline
					after={
						<Switch
							checked={settings.compactList}
							disabled={disabled}
							aria-label="Компактный список"
							onChange={event => update({ compactList: event.target.checked })}
						/>
					}
				>
					Компактный список
				</SimpleCell>
				<FormItem top="Встречи по умолчанию" htmlFor={filterId}>
					<Select
						id={filterId}
						value={settings.defaultFilter}
						disabled={disabled}
						options={[
							{ value: "all", label: "Все встречи" },
							{ value: "mine", label: "Мои встречи" },
							{ value: "weekend", label: "Встречи в выходные" },
						]}
						onChange={event => {
							const value = event.target.value;
							if (value === "all" || value === "mine" || value === "weekend") {
								update({ defaultFilter: value });
							}
						}}
					/>
				</FormItem>
			</Group>
			<Group>
				<Footer>
					{settingsStatus === "loading" &&
						"Загружаем сохранённые настройки из VK Storage."}
					{settingsStatus === "ready" &&
						"Изменения применяются сразу и автоматически сохраняются в VK Storage."}
					{settingsStatus === "error" &&
						"Последние значения применены локально. Проверьте уведомление об ошибке VK Storage."}
				</Footer>
			</Group>
		</>
	);
}
