import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/**
 * Authored icon set: one stroke weight (1.75), round caps and joins,
 * 24-box geometry scaled to size. No unicode glyphs stand in for icons.
 */
function Icon({ children, ...props }: IconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			{children}
		</svg>
	);
}

export const DiamondIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />
		<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
	</Icon>
);

export const TimelineIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M4 6h10M4 12h16M4 18h7" />
	</Icon>
);

export const ExecuteIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M4 12h13" />
		<path d="M13 6.5 18.5 12 13 17.5" />
	</Icon>
);

export const ClientsIcon = (props: IconProps) => (
	<Icon {...props}>
		<rect x="3" y="4.5" width="18" height="12" rx="2" />
		<path d="M8.5 20.5h7M12 16.5v4" />
	</Icon>
);

export const SunIcon = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
	</Icon>
);

export const MoonIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
	</Icon>
);

export const PauseIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M9 5.5v13M15 5.5v13" />
	</Icon>
);

export const PlayIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M7.5 5.5 18 12 7.5 18.5Z" />
	</Icon>
);

export const TrashIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M4.5 6.5h15M9.5 6V4.5h5V6M6.5 6.5l.8 13h9.4l.8-13" />
	</Icon>
);

export const CopyIcon = (props: IconProps) => (
	<Icon {...props}>
		<rect x="9" y="9" width="11" height="11" rx="2" />
		<path d="M5 15V6a2 2 0 0 1 2-2h9" />
	</Icon>
);

export const CheckIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M5 12.5 10 17.5 19 7" />
	</Icon>
);

export const CrossIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M6 6l12 12M18 6 6 18" />
	</Icon>
);

export const RefreshIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M20 12a8 8 0 1 1-2.5-5.8" />
		<path d="M20 3.5V7h-3.5" />
	</Icon>
);

export const ChevronIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M8.5 5 15.5 12 8.5 19" />
	</Icon>
);

export const ArrowOutIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" />
	</Icon>
);

export const ArrowInIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M20 12H5M10.5 6.5 5 12l5.5 5.5" />
	</Icon>
);

export const PhoneIcon = (props: IconProps) => (
	<Icon {...props}>
		<rect x="7" y="3" width="10" height="18" rx="2.5" />
		<path d="M10.5 17.75h3" />
	</Icon>
);

export const MonitorIcon = (props: IconProps) => (
	<Icon {...props}>
		<rect x="3" y="4.5" width="18" height="12" rx="2" />
		<path d="M8.5 20.5h7M12 16.5v4" />
	</Icon>
);

export const FrameIcon = (props: IconProps) => (
	<Icon {...props}>
		<rect x="3" y="3" width="18" height="18" rx="2" />
		<path d="M3 8.5h18M8.5 21V8.5" />
	</Icon>
);

export const GlobeIcon = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="8.5" />
		<path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5S14.6 18.2 12 20.5c-2.6-2.3-3.9-5.2-3.9-8.5S9.4 5.8 12 3.5Z" />
	</Icon>
);

export const WarningIcon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M12 4 21 19.5H3L12 4Z" />
		<path d="M12 10.5v4" />
		<circle cx="12" cy="16.75" r="0.5" fill="currentColor" stroke="none" />
	</Icon>
);

export function PlatformIcon({ platform, ...props }: IconProps & { platform: string }) {
	if (platform === "mobile-web") {
		return <PhoneIcon {...props} />;
	}
	if (platform === "iframe") {
		return <FrameIcon {...props} />;
	}
	if (platform === "standalone") {
		return <GlobeIcon {...props} />;
	}
	if (platform === "android" || platform === "ios") {
		return <PhoneIcon {...props} />;
	}
	return <MonitorIcon {...props} />;
}
