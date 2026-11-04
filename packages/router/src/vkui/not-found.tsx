import { Button, Placeholder } from "@vkontakte/vkui";

/**
 * Default 404 screen (parity with the old router's DefaultNotFound): wire it
 * as `defaultNotFoundComponent` in `createRouter`. TanStack otherwise
 * renders a bare `<p>Not Found</p>` and warns.
 */
export function NotFound(): React.ReactNode {
	return (
		<Placeholder
			title="Страница не найдена"
			action={
				<Button size="l" onClick={() => window.history.back()}>
					Назад
				</Button>
			}
		>
			Такой страницы не существует.
		</Placeholder>
	);
}
