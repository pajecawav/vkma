import { useRouterState } from "@tanstack/react-router";
import {
	Modals,
	Popouts,
	VkView,
	useInflate,
	useNavigator,
	type AppHandle,
} from "@vkma.dev/router/preset";
import {
	Icon28MessageOutline,
	Icon28MoreHorizontal,
	Icon28NewsfeedOutline,
	Icon28UserCircleOutline,
} from "@vkontakte/icons";
import {
	Cell,
	Counter,
	Epic,
	Group,
	Panel,
	PanelHeader,
	SplitCol,
	SplitLayout,
	Tabbar,
	TabbarItem,
	useAdaptivityConditionalRender,
} from "@vkontakte/vkui";
import type { ComponentType } from "react";
import { DebugOverlay } from "./debug";

/**
 * The showcase shell, mirroring the VKUI navigation guide: SplitLayout with
 * a header stub, a fixed sidebar of Cells on desktop, Epic + Tabbar on
 * mobile — all of it driven by the ROUTER (no local activeStory state).
 * Tabs navigate with `replace`, so back never walks the tab bar.
 */

interface TabConfig {
	id: string;
	label: string;
	to: "/" | "/feed" | "/messages" | "/more";
	Icon: ComponentType;
	badge?: number;
}

const TABS: TabConfig[] = [
	{ id: "profile", label: "Профиль", to: "/", Icon: Icon28UserCircleOutline },
	{ id: "feed", label: "Лента", to: "/feed", Icon: Icon28NewsfeedOutline },
	{ id: "messages", label: "Сообщения", to: "/messages", Icon: Icon28MessageOutline, badge: 3 },
	{ id: "more", label: "Ещё", to: "/more", Icon: Icon28MoreHorizontal },
];

/** The active story is the view containing the deepest matched route. */
function useActiveStory(app: AppHandle) {
	return useRouterState({
		select: (state): string => {
			const views = Object.values(app.views);
			for (let i = state.matches.length - 1; i >= 0; i--) {
				const routeId = state.matches[i]?.routeId ?? "";
				const view = views.find(
					view => routeId === view.id || routeId.startsWith(`${view.id}/`),
				);
				if (view !== undefined) {
					return view.id as string;
				}
			}
			return (views[0]?.id as string | undefined) ?? "";
		},
	});
}

export function AppShell({ app }: { app: AppHandle }) {
	useInflate(app);
	const navigator = useNavigator();
	const activeStory = useActiveStory(app);
	const { viewWidth } = useAdaptivityConditionalRender();
	const onTab = (to: TabConfig["to"]) => {
		void navigator.replace({ to });
	};

	return (
		<>
			<SplitLayout header={<PanelHeader delimiter="none" />} center>
				{viewWidth.tabletPlus && (
					<SplitCol
						className={viewWidth.tabletPlus.className}
						width="280px"
						maxWidth="280px"
						fixed
					>
						<Panel>
							<PanelHeader />
							<Group>
								{TABS.map(({ id, label, to, Icon, badge }) => (
									<Cell
										key={id}
										before={<Icon />}
										activated={activeStory === id}
										onClick={() => onTab(to)}
										indicator={
											badge !== undefined && activeStory !== id ? (
												<Counter
													size="s"
													mode="primary"
													appearance="accent-red"
												>
													{badge}
												</Counter>
											) : null
										}
									>
										{label}
									</Cell>
								))}
							</Group>
						</Panel>
					</SplitCol>
				)}
				<SplitCol maxWidth="560px" stretchedOnMobile autoSpaced>
					<Epic
						activeStory={activeStory}
						tabbar={
							viewWidth.tabletMinus && (
								<Tabbar className={viewWidth.tabletMinus.className}>
									{TABS.map(({ id, label, to, Icon, badge }) => (
										<TabbarItem
											key={id}
											label={label}
											selected={activeStory === id}
											indicator={
												badge !== undefined && activeStory !== id ? (
													<Counter
														size="s"
														mode="primary"
														appearance="accent-red"
													>
														{badge}
													</Counter>
												) : null
											}
											onClick={() => onTab(to)}
										>
											<Icon />
										</TabbarItem>
									))}
								</Tabbar>
							)
						}
					>
						{Object.values(app.views).map(view => (
							<VkView key={view.id} view={view} nav={view.id} />
						))}
					</Epic>
				</SplitCol>
			</SplitLayout>
			<Modals entries={app.modals} />
			<Popouts entries={app.popouts} />
			<DebugOverlay />
		</>
	);
}
