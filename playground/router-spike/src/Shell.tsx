import { Outlet } from "@tanstack/react-router";
import { AppRoot, ConfigProvider, SplitCol, SplitLayout } from "@vkontakte/vkui";
import { Hud } from "./Hud";

/**
 * PROTOTYPE (spike 1) shell. Platform forced to iOS (parallax transitions)
 * and SplitCol animate forced on so animations run on a desktop viewport.
 */
export function Shell() {
	return (
		<ConfigProvider platform="ios">
			<AppRoot>
				<SplitLayout>
					<SplitCol animate>
						<Outlet />
					</SplitCol>
				</SplitLayout>
				<Hud />
			</AppRoot>
		</ConfigProvider>
	);
}
