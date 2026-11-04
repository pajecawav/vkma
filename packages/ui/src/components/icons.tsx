import type { LucideProps } from "lucide-react";
import { Globe, Monitor, PanelsTopLeft, Smartphone } from "lucide-react";
import { VKMA_LOGO_PATH } from "../logo-path.ts";

/**
 * Lucide icons under the panel's house defaults (16px, stroke 1.75), set
 * once in `LucideProvider` (App.tsx), so these are direct re-exports. The
 * only two exceptions: VkmaLogoIcon is the brand mark (hand-made, not a
 * lucide shape), and PlatformIcon maps a platform string to a shape.
 */
export {
	AlignLeft as TimelineIcon,
	ArrowLeft as ArrowInIcon,
	ArrowRight as ArrowOutIcon,
	ArrowRight as ExecuteIcon,
	Check as CheckIcon,
	ChevronRight as ChevronIcon,
	Copy as CopyIcon,
	Crosshair as LocateIcon,
	Diamond as DiamondIcon,
	EyeOff as EyeOffIcon,
	Globe as GlobeIcon,
	Monitor as ClientsIcon,
	Monitor as MonitorIcon,
	Moon as MoonIcon,
	PanelRight as PanelRightIcon,
	PanelsTopLeft as FrameIcon,
	Pause as PauseIcon,
	Play as PlayIcon,
	RotateCw as RefreshIcon,
	Settings2 as Settings2Icon,
	Smartphone as PhoneIcon,
	Sun as SunIcon,
	Trash2 as TrashIcon,
	TriangleAlert as WarningIcon,
	X as CrossIcon,
} from "lucide-react";

export const VkmaLogoIcon = (props: LucideProps) => (
	<svg
		viewBox="0 0 24 24"
		width="16"
		height="16"
		fill="currentColor"
		stroke="none"
		aria-hidden="true"
		{...props}
	>
		<path d={VKMA_LOGO_PATH} />
	</svg>
);

export function PlatformIcon({ platform, ...props }: LucideProps & { platform: string }) {
	if (platform === "mobile-web") {
		return <Smartphone {...props} />;
	}
	if (platform === "iframe") {
		return <PanelsTopLeft {...props} />;
	}
	if (platform === "standalone") {
		return <Globe {...props} />;
	}
	if (platform === "android" || platform === "ios") {
		return <Smartphone {...props} />;
	}
	return <Monitor {...props} />;
}
