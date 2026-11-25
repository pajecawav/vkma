import { Popover } from "@base-ui/react/popover";
import type { CaptureMode, ConnectionStatus } from "@vkma.dev/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { clientColor } from "../lib/colors.ts";
import { ClientDot } from "./ClientDot.tsx";
import { IconButton } from "./IconButton.tsx";
import { CrossIcon, MoonIcon, MoreIcon, RefreshIcon, SunIcon, VkmaLogoIcon } from "./icons.tsx";
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

/** Secondary controls and where they live: `menu` is their copy inside
 * the ⋯ popover (the only one on a narrow header); `inline`, when given,
 * replaces the popover on a wide header (512px and up). Leave `inline` out
 * when a control has no look worth that room. */
export interface TopBarOverflow {
	inline?: ReactNode;
	menu: ReactNode;
}

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

/** The colored client chip: the short id on a wider header, the dot
 * alone on a narrow one (the color is the badge; the id rides the hint
 * and the accessible name either way). */
function ClientBadge({ clientId, compact }: { clientId: string; compact: boolean }) {
	const color = clientColor(clientId);
	const id = clientId.slice(0, 8);
	return (
		<Tooltip content={`This panel is scoped to client ${id}`}>
			<span
				role={compact ? "img" : undefined}
				aria-label={compact ? `Client ${id}` : undefined}
				className={`shrink-0 items-center rounded-md bg-neutral-100 font-mono text-[11px] leading-none ${color.text} dark:bg-neutral-800 ${
					compact
						? "inline-flex p-1.5 @sm:hidden"
						: "hidden gap-1.5 px-2 py-1 @sm:inline-flex"
				}`}
			>
				<ClientDot clientId={clientId} />
				{!compact && id}
			</span>
		</Tooltip>
	);
}

/** Escape in a field that holds text leaves the field first; only the
 * next press reaches the panel. */
function isFilledField(
	target: EventTarget | null,
): target is HTMLInputElement | HTMLTextAreaElement {
	return (
		(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
		target.value !== ""
	);
}

/**
 * The panel header. Everything here is sized by the panel itself
 * (container queries on the header), because the panel lives in small
 * overlays: a FAB iframe as narrow as a 320px phone. As the room runs
 * out, items yield in this order:
 *
 * - on a FAB panel (secondary controls inline, a close button) the
 *   wordmark yields to the bare logo below 576px — the brand text is the
 *   first thing to go where the chrome is densest; a sparse header
 *   (the standalone panel) keeps it down to 512px;
 * - the reconnect button hides below 576px (every surface's gate repeats
 *   the action right under the header);
 * - secondary controls (`overflow`) fold behind the ⋯ button below 512px;
 * - the capture chip hides below 384px (assistive tech keeps it);
 * - the client badge yields to its color dot below 384px.
 *
 * The status never yields: its label truncates instead. The theme toggle
 * and the close button are always there.
 */
export function TopBar({
	status,
	onReconnect,
	clientBadge,
	capture,
	actions,
	overflow,
	onClose,
	theme,
}: {
	status: ConnectionStatus;
	onReconnect: () => void;
	clientBadge?: { clientId: string };
	/** Capture-mode chip: only meaningful when the feed is one client's
	 * (or uniform). Mixed feeds show the mode per client card instead. */
	capture?: CaptureMode;
	/** Surface-specific buttons (e.g. the inspector's "Connect"),
	 * rendered next to the theme toggle. They keep their width at every
	 * panel size: hand in only what must stay visible. */
	actions?: ReactNode;
	/** Secondary controls (e.g. the FAB position): behind the ⋯ button on
	 * a narrow header, inline on a wide one when `inline` is given. */
	overflow?: TopBarOverflow;
	/** Adds the close button and binds Escape to it — the FAB's
	 * full-bleed sheet, which covers its own toggle on narrow viewports. */
	onClose?: () => void;
	/** Overrides the panel-local localStorage theme (the extension backs
	 * it with chrome.storage so every surface shares one preference). */
	theme?: { dark: boolean; toggle: () => void };
}) {
	const [localDark, toggleLocalTheme] = useTheme();
	const dark = theme?.dark ?? localDark;
	const toggleTheme = theme?.toggle ?? toggleLocalTheme;
	// Where the chrome is densest the brand text goes first: with the
	// inline controls and a close button, a 512px header holds the logo,
	// not "vkma devtools" (measured: 431px against 535px with the text).
	const wordmarkAt =
		overflow?.inline !== undefined || onClose !== undefined ? "@xl:inline" : "@lg:inline";

	// Escape closes — unless something closer to the user claims the key
	// first. Captured on the way down (a Base UI popup stops the key from
	// ever bubbling out of the React root), with the verdict deferred to
	// the end of the dispatch: a popup that takes an Escape (an open
	// tooltip, a select) calls preventDefault on it, and a field with text
	// in it keeps the press for itself.
	useEffect(() => {
		if (onClose === undefined) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}
			if (isFilledField(event.target)) {
				event.target.blur();
				return;
			}
			setTimeout(() => {
				if (!event.defaultPrevented) {
					onClose();
				}
			}, 0);
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [onClose]);

	return (
		<header className="@container shrink-0 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
			<div className="flex h-12 items-center gap-3 px-4 @max-sm:gap-2 @max-sm:px-3">
				<div className="flex shrink-0 items-center gap-2 select-none">
					<VkmaLogoIcon className="text-neutral-900 dark:text-neutral-100" />
					<span className={`hidden text-sm font-semibold tracking-tight ${wordmarkAt}`}>
						vkma
						<span className="ml-1.5 font-normal text-neutral-400">devtools</span>
					</span>
				</div>

				<div className="ml-auto flex min-w-0 items-center gap-3 @max-sm:gap-2">
					{capture &&
						(() => {
							const meta = CAPTURE_META[capture];
							return (
								<>
									<Tooltip content={meta.title}>
										<span
											className={`hidden shrink-0 items-center rounded-md px-2 py-1 text-[11px] font-medium leading-none @sm:inline-flex ${meta.chip}`}
										>
											{meta.label}
										</span>
									</Tooltip>
									<span className="sr-only @sm:hidden">{`Capture mode: ${meta.label}`}</span>
								</>
							);
						})()}
					{clientBadge && (
						<>
							<ClientBadge clientId={clientBadge.clientId} compact={false} />
							<ClientBadge clientId={clientBadge.clientId} compact />
						</>
					)}
					<StatusLine status={status} />
					{overflow && (
						<>
							{overflow.inline !== undefined && (
								<div className="hidden shrink-0 items-center gap-2 @lg:flex">
									{overflow.inline}
								</div>
							)}
							<Popover.Root>
								<Popover.Trigger
									render={
										<IconButton
											label="More controls"
											className={
												overflow.inline !== undefined
													? "@lg:hidden"
													: undefined
											}
										>
											<MoreIcon />
										</IconButton>
									}
								/>
								<Popover.Portal>
									<Popover.Positioner
										align="end"
										sideOffset={6}
										collisionPadding={8}
										className="z-50"
									>
										<Popover.Popup className="z-50 min-w-48 rounded-lg bg-white p-2 shadow-lg ring-1 ring-neutral-200 outline-none transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none dark:bg-neutral-900 dark:ring-neutral-800 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 [transform-origin:var(--transform-origin)]">
											<Popover.Title className="sr-only">
												More controls
											</Popover.Title>
											{overflow.menu}
										</Popover.Popup>
									</Popover.Positioner>
								</Popover.Portal>
							</Popover.Root>
						</>
					)}
					{actions}
					{(status === "disconnected" || status === "error") && (
						<span className="hidden @xl:inline-flex">
							<IconButton label="Reconnect" onClick={onReconnect}>
								<RefreshIcon />
							</IconButton>
						</span>
					)}
					<IconButton
						label={dark ? "Switch to light theme" : "Switch to dark theme"}
						onClick={toggleTheme}
					>
						{dark ? <SunIcon /> : <MoonIcon />}
					</IconButton>
					{onClose && (
						<IconButton label="Close panel" onClick={onClose}>
							<CrossIcon />
						</IconButton>
					)}
				</div>
			</div>
		</header>
	);
}
