import type { ReactNode } from "react";
import { ClientsIcon, ExecuteIcon, TimelineIcon } from "./icons.tsx";

export type Section = "timeline" | "execute" | "clients";

const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
	{ id: "timeline", label: "Timeline", icon: <TimelineIcon /> },
	{ id: "execute", label: "Execute", icon: <ExecuteIcon /> },
	{ id: "clients", label: "Clients", icon: <ClientsIcon /> },
];

export function Rail({
	section,
	onSelect,
}: {
	section: Section;
	onSelect: (section: Section) => void;
}) {
	return (
		<nav
			aria-label="Sections"
			className="flex shrink-0 gap-1 border-b border-neutral-200 bg-white px-2 py-1.5 dark:border-neutral-800 dark:bg-neutral-900 sm:w-44 sm:flex-col sm:gap-0.5 sm:border-r sm:border-b-0 sm:py-3"
		>
			{SECTIONS.map(({ id, label, icon }) => {
				const active = section === id;
				return (
					<button
						key={id}
						type="button"
						onClick={() => onSelect(id)}
						aria-current={active ? "page" : undefined}
						className={`flex flex-1 items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium sm:justify-start sm:flex-none sm:text-sm ${
							active
								? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
								: "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-100"
						}`}
					>
						{icon}
						{label}
					</button>
				);
			})}
		</nav>
	);
}
