import bridge from "@vkma.dev/bridge";
import type { Meeting } from "./data";
import { errorText, showNotice } from "./store";

export function meetingLink(meeting: Meeting): string {
	const url = new URL(window.location.href);
	url.hash = `/meeting/${meeting.id}`;
	return url.toString();
}

export async function shareMeeting(meeting: Meeting): Promise<boolean> {
	try {
		await bridge.send("VKWebAppShare", { link: meetingLink(meeting) });
		showNotice("Ссылка на встречу передана host");
		return true;
	} catch (error) {
		showNotice(`Поделиться не удалось: ${errorText(error)}`);
		return false;
	}
}

export async function showInviteBox(): Promise<boolean> {
	try {
		await bridge.send("VKWebAppShowInviteBox", {});
		showNotice("Приглашения отправлены через native host UI");
		return true;
	} catch (error) {
		showNotice(`Приглашение отменено или недоступно: ${errorText(error)}`);
		return false;
	}
}

export async function showPlannerTour(): Promise<void> {
	try {
		const result = await bridge.send("VKWebAppShowSlidesSheet", {
			slides: [
				{
					title: "Соберите расписание",
					subtitle: "Создавайте встречи и открывайте их по прямым ссылкам.",
					media: { type: "image", url: "https://vk.ru/images/camera_200.png" },
				},
				{
					title: "Позовите участников",
					subtitle: "Друзья, приглашения и шеринг работают через VK Bridge.",
					media: { type: "image", url: "https://vk.ru/images/camera_200.png" },
				},
				{
					title: "Проверьте host",
					subtitle: "Host lab за ?debug=1 управляет конфигурацией и ошибками.",
					media: { type: "image", url: "https://vk.ru/images/camera_200.png" },
				},
			],
		});
		showNotice(result.action === "confirm" ? "Native-тур завершён" : "Native-тур закрыт");
	} catch (error) {
		showNotice(`Native-тур недоступен: ${errorText(error)}`);
	}
}

export async function addAppToFavorites(): Promise<boolean> {
	try {
		await bridge.send("VKWebAppAddToFavorites", {});
		showNotice("Планировщик добавлен в избранное VK");
		return true;
	} catch (error) {
		showNotice(`В избранное не добавлено: ${errorText(error)}`);
		return false;
	}
}
