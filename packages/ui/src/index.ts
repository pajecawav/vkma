/**
 * @vkma.dev/ui, the design system of the vkma.dev surfaces: design
 * tokens (Tailwind v4 CSS-first, see `styles.css`), the icon set and the
 * presentational devtools panel components. Everything here renders data
 * handed in via props. Data sources (devframe RPC, extension messaging)
 * live with the consumers.
 */
export { EventRow, RequestGroup } from "./components/EventRow.tsx";
export type { RequestGroupProps } from "./components/EventRow.tsx";
export { CopyInput } from "./components/CopyInput.tsx";
export { Button } from "./components/Button.tsx";
export { IconButton } from "./components/IconButton.tsx";
export { Modal } from "./components/Modal.tsx";
export type { ModalProps } from "./components/Modal.tsx";
export { Switch } from "./components/Switch.tsx";
export type { SwitchProps } from "./components/Switch.tsx";
export { Tooltip } from "./components/Tooltip.tsx";
export type { TooltipProps, TooltipPlacement } from "./components/Tooltip.tsx";
export { ClientDot } from "./components/ClientDot.tsx";
export { StatusLine, STATUS_META } from "./components/StatusLine.tsx";
export { Timeline } from "./components/Timeline.tsx";
export type { IgnoredEventsControl } from "./components/Timeline.tsx";
export { IgnoredEventsEditor } from "./components/IgnoredEventsEditor.tsx";
export type { IgnoredEventsEditorProps } from "./components/IgnoredEventsEditor.tsx";
export { ClientSelect } from "./components/ClientSelect.tsx";
export type { ClientSelectProps } from "./components/ClientSelect.tsx";
export { EventNameField } from "./components/EventNameField.tsx";
export type { EventNameFieldProps } from "./components/EventNameField.tsx";
export { Execute } from "./components/Execute.tsx";
export { Clients } from "./components/Clients.tsx";
export { Rail } from "./components/Rail.tsx";
export type { Section } from "./components/Rail.tsx";
export { TopBar } from "./components/TopBar.tsx";
export { JsonTree } from "./components/JsonTree.tsx";
export { UiProvider } from "./provider.tsx";
export { FabPositionControl } from "./components/FabPositionControl.tsx";
export {
	ArrowInIcon,
	ArrowOutIcon,
	CheckIcon,
	ChevronIcon,
	ClientsIcon,
	CrossIcon,
	DiamondIcon,
	ExecuteIcon,
	FrameIcon,
	GlobeIcon,
	LocateIcon,
	MonitorIcon,
	MoonIcon,
	PhoneIcon,
	PlayIcon,
	PauseIcon,
	RefreshIcon,
	SunIcon,
	TimelineIcon,
	TrashIcon,
	WarningIcon,
	VkmaLogoIcon,
	PlatformIcon,
	PanelRightIcon,
} from "./components/icons.tsx";
export { clientColor } from "./lib/colors.ts";
export {
	DEFAULT_IGNORED_EVENTS,
	DEFAULT_IGNORED_SETTINGS,
	ignoreName,
	parseIgnoredSettings,
	resolveIgnoredNames,
} from "./lib/ignored-events.ts";
export type { IgnoredEventsSettings } from "./lib/ignored-events.ts";
export {
	formatDuration,
	formatJson,
	formatPayloadPreview,
	formatTime,
	platformLabel,
	relativeTime,
	shortId,
} from "./lib/format.ts";
