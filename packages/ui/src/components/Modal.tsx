import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton.tsx";
import { CrossIcon } from "./icons.tsx";

export interface ModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The dialog's accessible name, rendered as the header row. */
	title: string;
	children: ReactNode;
	/** Extra classes for the popup card (defaults to the centered sheet look). */
	className?: string;
}

/**
 * A centered modal dialog on Base UI's Dialog: Escape and outside-press
 * dismiss it, focus is trapped while open, background scroll is locked.
 * The open/close transition rides Base UI's data-starting-style /
 * data-ending-style attributes, CSS transitions, so closing midway
 * through the opening animation lands smoothly instead of snapping
 * (and honors prefers-reduced-motion via motion-reduce).
 */
export function Modal({ open, onOpenChange, title, children, className }: ModalProps) {
	return (
		<Dialog.Root
			open={open}
			onOpenChange={next => {
				onOpenChange(next);
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-50 bg-neutral-950/40 transition-opacity duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
				<Dialog.Popup
					className={`fixed left-1/2 top-1/2 z-50 flex max-h-dvh w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-xl transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] outline-none motion-reduce:transition-none dark:border-neutral-800 dark:bg-neutral-900 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 ${className ?? ""}`}
				>
					<header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-3.5 dark:border-neutral-800">
						<Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
						<IconButton label="Close" onClick={() => onOpenChange(false)}>
							<CrossIcon />
						</IconButton>
					</header>
					{children}
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
