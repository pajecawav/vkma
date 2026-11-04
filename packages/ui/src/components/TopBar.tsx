import type { CaptureMode, ConnectionStatus } from "@vkma.dev/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { clientColor } from "../lib/colors.ts";
import { ClientDot } from "./ClientDot.tsx";
import { IconButton } from "./IconButton.tsx";
import { MoonIcon, RefreshIcon, SunIcon, VkmaLogoIcon } from "./icons.tsx";
import { StatusLine } from "./StatusLine.tsx";
import { Tooltip } from "./Tooltip.tsx";

const CAPTURE_META: Record<CaptureMode, { label: string; chip: string; title: string }> = {
	direct: {
		label: "vkma bridge",
		chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
		title: "A @vkma.dev/bridge tap is published on the page (unverified provenance — raw capture stays live as a cross-check)",
	},
	spy: {
		label: "sniffer",
		chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
		title: "No vkma bridge on the page — traffic is captured via the bridge sniffer",
	},
};

function useTheme(): [dark: boolean, toggle: () => void] {
	const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
	useEffect(() => {
		document.documentElement.classList.toggle("dark", dark);
		try {
			localStorage.setItem("vkma:theme", dark ? "dark" : "light");
		} catch {}
	}, [dark]);
	return [dark, () => setDark(value => !value)];
}

export function TopBar({
	status,
	onReconnect,
	clientBadge,
	capture,
	actions,
	theme,
}: {
	status: ConnectionStatus;
	onReconnect: () => void;
	clientBadge?: { clientId: string };
	/** Capture-mode chip: only meaningful when the feed is one client's
	 * (or uniform). Mixed feeds show the mode per client card instead. */
	capture?: CaptureMode;
	/** Surface-specific buttons (e.g. the extension's "open side panel"),
	 * rendered next to the theme toggle. */
	actions?: ReactNode;
	/** Overrides the panel-local localStorage theme (the extension backs
	 * it with chrome.storage so every surface shares one preference). */
	theme?: { dark: boolean; toggle: () => void };
}) {
	const [localDark, toggleLocalTheme] = useTheme();
	const dark = theme?.dark ?? localDark;
	const toggleTheme = theme?.toggle ?? toggleLocalTheme;

	return (
		<header className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
			<div className="flex items-center gap-2 select-none">
				<VkmaLogoIcon className="text-neutral-900 dark:text-neutral-100" />
				<span className="text-sm font-semibold tracking-tight">
					vkma
					<span className="ml-1.5 font-normal text-neutral-400">devtools</span>
				</span>
			</div>

			<div className="ml-auto flex items-center gap-3">
				{capture &&
					(() => {
						const meta = CAPTURE_META[capture];
						return (
							<Tooltip content={meta.title}>
								<span
									className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium leading-none ${meta.chip}`}
								>
									{meta.label}
								</span>
							</Tooltip>
						);
					})()}
				{clientBadge &&
					(() => {
						const color = clientColor(clientBadge.clientId);
						return (
							<Tooltip content="This panel is scoped to this client">
								<span
									className={`inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 font-mono text-[11px] leading-none ${color.text} dark:bg-neutral-800`}
								>
									<ClientDot clientId={clientBadge.clientId} />
									{clientBadge.clientId.slice(0, 8)}
								</span>
							</Tooltip>
						);
					})()}
				<StatusLine status={status} />
				{actions}
				{(status === "disconnected" || status === "error") && (
					<IconButton label="Reconnect" onClick={onReconnect}>
						<RefreshIcon />
					</IconButton>
				)}
				<IconButton
					label={dark ? "Switch to light theme" : "Switch to dark theme"}
					onClick={toggleTheme}
				>
					{dark ? <SunIcon /> : <MoonIcon />}
				</IconButton>
			</div>
		</header>
	);
}
