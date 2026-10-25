import type { ConnectionStatus } from "@vkma.dev/protocol";
import { useEffect, useState } from "react";
import { clientColor } from "../lib/colors.ts";
import { MoonIcon, RefreshIcon, SunIcon, VkmaLogoIcon } from "./icons.tsx";

const STATUS_META: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
	connecting: { label: "Connecting", dot: "bg-neutral-400", text: "text-neutral-500" },
	connected: { label: "Connected", dot: "bg-emerald-500", text: "text-neutral-500" },
	unauthorized: {
		label: "Not authorized",
		dot: "bg-amber-500",
		text: "text-amber-600 dark:text-amber-400",
	},
	disconnected: {
		label: "Disconnected",
		dot: "bg-neutral-300 dark:bg-neutral-600",
		text: "text-neutral-500",
	},
	error: { label: "Connection error", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
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
}: {
	status: ConnectionStatus;
	onReconnect: () => void;
	clientBadge?: { clientId: string };
}) {
	const [dark, toggleTheme] = useTheme();
	const meta = STATUS_META[status];

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
				{clientBadge &&
					(() => {
						const color = clientColor(clientBadge.clientId);
						return (
							<span
								className={`inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 font-mono text-[11px] leading-none ${color.text} dark:bg-neutral-800`}
								title="This panel is scoped to this client"
							>
								<span
									className={`size-1.5 rounded-[2px] ${color.dot}`}
									aria-hidden="true"
								/>
								{clientBadge.clientId.slice(0, 8)}
							</span>
						);
					})()}
				<span className="flex items-center gap-2 text-xs" title={`RPC: ${meta.label}`}>
					<span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
					<span className={meta.text}>{meta.label}</span>
				</span>
				{(status === "disconnected" || status === "error") && (
					<button
						type="button"
						onClick={onReconnect}
						className="grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
						title="Reconnect"
					>
						<RefreshIcon />
					</button>
				)}
				<button
					type="button"
					onClick={toggleTheme}
					className="grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
					title={dark ? "Switch to light theme" : "Switch to dark theme"}
				>
					{dark ? <SunIcon /> : <MoonIcon />}
				</button>
			</div>
		</header>
	);
}
