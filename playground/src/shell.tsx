import {
	createVkLink,
	Modals,
	NotFound,
	Popouts,
	useActiveStory,
	useInflate,
	VkView,
	type AppHandle,
	type PanelPage,
} from "@vkma.dev/router/preset";
import { storyKeyOf } from "@vkma.dev/router/vkui";
import {
	Icon28CalendarOutline,
	Icon28MailOutline,
	Icon28UserCircleOutline,
} from "@vkontakte/icons";
import {
	Cell,
	Epic,
	Group,
	Panel,
	PanelHeader,
	PanelHeaderContent,
	Snackbar,
	SplitCol,
	SplitLayout,
	Tabbar,
	TabbarItem,
	useAdaptivityConditionalRender,
} from "@vkontakte/vkui";
import type { ComponentType } from "react";
import { DebugOverlay } from "./debug";
import { invitationsPanel } from "./panels/invitations/invitations.panel";
import { plansPanel } from "./panels/plans/plans.panel";
import { profilePanel } from "./panels/profile/profile.panel";
import { dismissNotice, usePlannerState } from "./store";

const CellLink = createVkLink(Cell);
const TabbarItemLink = createVkLink(TabbarItem);

interface TabConfig {
	id: string;
	label: string;
	page: PanelPage;
	Icon: ComponentType;
}

const TABS: TabConfig[] = [
	{ id: "plans", label: "Планы", page: plansPanel, Icon: Icon28CalendarOutline },
	{
		id: "invitations",
		label: "Приглашения",
		page: invitationsPanel,
		Icon: Icon28MailOutline,
	},
	{ id: "profile", label: "Профиль", page: profilePanel, Icon: Icon28UserCircleOutline },
];

export function AppShell({ app }: { app: AppHandle }) {
	useInflate(app);
	const activeStory = useActiveStory(app);
	const { viewWidth } = useAdaptivityConditionalRender();
	const { notice } = usePlannerState();

	if (activeStory === null) {
		return (
			<>
				<NotFound />
				<DebugOverlay />
			</>
		);
	}

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
							<PanelHeader>
								<PanelHeaderContent subtitle="Расписание и приглашения">
									Планировщик
								</PanelHeaderContent>
							</PanelHeader>
							<Group>
								{TABS.map(({ id, label, page, Icon }) => (
									<CellLink
										key={id}
										before={<Icon />}
										activated={activeStory === id}
										page={page}
										replace
									>
										{label}
									</CellLink>
								))}
							</Group>
						</Panel>
					</SplitCol>
				)}
				<SplitCol maxWidth="900px" stretchedOnMobile autoSpaced>
					<Epic
						activeStory={activeStory}
						tabbar={
							viewWidth.tabletMinus && (
								<Tabbar className={viewWidth.tabletMinus.className}>
									{TABS.map(({ id, label, page, Icon }) => (
										<TabbarItemLink
											key={id}
											label={label}
											selected={activeStory === id}
											page={page}
											replace
										>
											<Icon />
										</TabbarItemLink>
									))}
								</Tabbar>
							)
						}
					>
						{Object.values(app.views).map(view => (
							<VkView key={view.id} view={view} nav={storyKeyOf(view.id)} />
						))}
					</Epic>
				</SplitCol>
			</SplitLayout>
			<Modals entries={app.modals} />
			<Popouts entries={app.popouts} />
			{notice !== null && (
				<Snackbar key={notice.id} onClose={dismissNotice} onClosed={dismissNotice}>
					{notice.text}
				</Snackbar>
			)}
			<DebugOverlay />
		</>
	);
}
