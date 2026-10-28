/**
 * @vkma.dev/ui — the design system of the vkma.dev surfaces: design
 * tokens (Tailwind v4 CSS-first, see `styles.css`), the icon set and the
 * presentational devtools panel components. Everything here renders data
 * handed in via props — data sources (devframe RPC, extension messaging)
 * live with the consumers.
 */
export { EventRow, RequestGroup } from "./components/EventRow.tsx";
export type { RequestGroupProps } from "./components/EventRow.tsx";
export { CopyInput } from "./components/CopyInput.tsx";
export { Button } from "./components/Button.tsx";
export { IconButton } from "./components/IconButton.tsx";
export { Modal } from "./components/Modal.tsx";
export type { ModalProps } from "./components/Modal.tsx";
export { Tooltip } from "./components/Tooltip.tsx";
export type { TooltipProps, TooltipPlacement } from "./components/Tooltip.tsx";
export { ClientDot } from "./components/ClientDot.tsx";
export { StatusLine, STATUS_META } from "./components/StatusLine.tsx";
export { Timeline } from "./components/Timeline.tsx";
export { ClientSelect } from "./components/ClientSelect.tsx";
export type { ClientSelectProps } from "./components/ClientSelect.tsx";
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
	formatDuration,
	formatJson,
	formatPayloadPreview,
	formatTime,
	platformLabel,
	relativeTime,
	shortId,
} from "./lib/format.ts";
