import { useState } from "react";

/**
 * Minimal collapsible JSON tree, styled for the quiet-ledger world:
 * neutral tones only, hairline indents, monospace. No dependencies.
 * Nodes deeper than `defaultOpenDepth` start collapsed.
 */

const DEFAULT_OPEN_DEPTH = 2;

function Primitive({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <span className="italic text-neutral-400">null</span>;
	}
	if (typeof value === "string") {
		return <span className="text-neutral-600 dark:text-neutral-300">"{value}"</span>;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return (
			<span className="font-medium text-neutral-900 dark:text-neutral-100">
				{String(value)}
			</span>
		);
	}
	if (typeof value === "bigint" || typeof value === "symbol") {
		return (
			<span className="font-medium text-neutral-900 dark:text-neutral-100">
				{value.toString()}
			</span>
		);
	}
	return <span className="text-neutral-500">{JSON.stringify(value) ?? "undefined"}</span>;
}

function Branch({
	name,
	value,
	depth,
}: {
	name?: string;
	value: Record<string, unknown> | unknown[];
	depth: number;
}) {
	const [open, setOpen] = useState(depth < DEFAULT_OPEN_DEPTH);
	const entries: [string, unknown][] = Array.isArray(value)
		? value.map((item, index) => [String(index), item])
		: Object.entries(value);
	const openBracket = Array.isArray(value) ? "[" : "{";
	const closeBracket = Array.isArray(value) ? "]" : "}";

	return (
		<div>
			<button
				type="button"
				onClick={() => {
					setOpen(state => !state);
				}}
				aria-expanded={open}
				className="flex w-full cursor-pointer items-baseline gap-1.5 rounded px-1 text-left hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50"
			>
				<span
					className={`shrink-0 text-[9px] text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
					aria-hidden="true"
				>
					▶
				</span>
				{name !== undefined && (
					<span className="shrink-0 font-mono text-neutral-500">{name}:</span>
				)}
				<span className="font-mono text-neutral-400">
					{openBracket}
					{entries.length === 0 ? closeBracket : ` ${entries.length} `}
					{!open && entries.length > 0 ? closeBracket : ""}
				</span>
			</button>
			{open && (
				<div className="ml-2 border-l border-neutral-200 pl-3 dark:border-neutral-800">
					{entries.map(([key, child]) => (
						<Node key={key} name={key} value={child} depth={depth + 1} />
					))}
					<div className="px-1 font-mono text-neutral-400">{closeBracket}</div>
				</div>
			)}
		</div>
	);
}

function Node({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
	if (value !== null && typeof value === "object") {
		return (
			<Branch
				name={name}
				value={value as Record<string, unknown> | unknown[]}
				depth={depth}
			/>
		);
	}
	return (
		<div className="flex items-baseline gap-1.5 px-1">
			{name !== undefined && (
				<span className="shrink-0 font-mono text-neutral-500">{name}:</span>
			)}
			<span className="break-all font-mono">
				<Primitive value={value} />
			</span>
		</div>
	);
}

export function JsonTree({ value }: { value: unknown }) {
	if (value === undefined) {
		return (
			<div className="px-1 font-mono text-neutral-400">
				<Primitive value={null} />
			</div>
		);
	}
	if (value !== null && typeof value !== "object") {
		return (
			<div className="px-1 font-mono">
				<Primitive value={value} />
			</div>
		);
	}
	return (
		<div className="py-0.5 font-mono text-[11px] leading-relaxed">
			<Node value={value} depth={0} />
		</div>
	);
}
