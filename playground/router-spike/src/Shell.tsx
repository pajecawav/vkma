import { Outlet } from "@tanstack/react-router";
import { AppRoot, ConfigProvider, SplitCol, SplitLayout } from "@vkontakte/vkui";
import { Hud } from "./Hud";
import { Modals, modalEntries } from "./modals";

/**
 * PROTOTYPE (spikes 1–2) shell. Platform forced to iOS (parallax transitions)
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
				<Modals entries={modalEntries} />
				<Hud />
			</AppRoot>
		</ConfigProvider>
	);
}
