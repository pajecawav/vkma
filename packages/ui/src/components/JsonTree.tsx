import { memo, useMemo, useState } from "react";
import type { ReactNode } from "react";
import styles from "./JsonTree.module.css";

/**
 * Chrome-DevTools-style collapsible JSON tree (ported from the inspector's
 * PayloadCollapsedPreview, adapted to the vkma themes): colored
 * keys/strings/numbers, collapsed containers preview their first entries
 * inline (`{ key : {…}, count : 11 }`), arrays get a length row, children
 * render in 500-item chunks. Nodes are memoized. Collapsed subtrees cost
 * one cheap branch render on panel updates.
 */

const CHUNK_SIZE = 500;
const PREVIEW_ENTRIES = 5;
const PREVIEW_STRING_LENGTH = 30;

const EMPTY_ENTRIES: [string | number, unknown][] = [];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isContainer = (value: unknown): value is Record<string, unknown> | unknown[] =>
	typeof value === "object" && value !== null;

const truncate = (value: string) =>
	value.length > PREVIEW_STRING_LENGTH ? `${value.slice(0, PREVIEW_STRING_LENGTH)}…` : value;

const childEntries = (value: unknown): [string | number, unknown][] => {
	if (Array.isArray(value)) {
		return value.map((item, index) => [index, item]);
	}
	if (isPlainObject(value)) {
		return Object.entries(value);
	}
	return EMPTY_ENTRIES;
};

const formatPrimitive = (value: unknown): string => {
	if (value === null) {
		return "null";
	}
	if (value === undefined) {
		return "undefined";
	}
	if (typeof value === "string") {
		return `"${value}"`;
	}
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
		return value.toString();
	}
	return JSON.stringify(value);
};

const Mini = memo(function Mini({ value }: { value: unknown }) {
	if (Array.isArray(value)) {
		return <span className={styles.muted}>Array({value.length})</span>;
	}
	if (isPlainObject(value)) {
		return <span className={styles.muted}>{"{…}"}</span>;
	}
	if (typeof value === "string") {
		return <span className={styles.string}>"{truncate(value)}"</span>;
	}
	if (value === null || value === undefined) {
		return <span className={styles.nullValue}>{value === null ? "null" : "undefined"}</span>;
	}
	return <span className={styles.number}>{formatPrimitive(value)}</span>;
});

const CollapsedPreview = memo(function CollapsedPreview({ value }: { value: unknown }) {
	const isArray = Array.isArray(value);
	const entries = isArray
		? (value as unknown[])
				.slice(0, PREVIEW_ENTRIES)
				.map((item, index) => [index, item] as const)
		: Object.entries(value as Record<string, unknown>).slice(0, PREVIEW_ENTRIES);
	const total = isArray ? value.length : Object.keys(value as object).length;
	const hasMore = total > entries.length;

	return (
		<span>
			{isArray ? (
				<>
					<span className={styles.muted}>({total}) </span>
					<span className={styles.brace}>[</span>
				</>
			) : (
				<span className={styles.brace}>{"{"}</span>
			)}
			{entries.map(([key, child], index) => (
				<span key={key}>
					{index > 0 && ", "}
					{isArray ? (
						<span className={styles.muted}>{key}</span>
					) : (
						<span className={styles.key}>{key}</span>
					)}
					<span className={styles.colon}>:</span>
					<Mini value={child} />
				</span>
			))}
			{hasMore && <span className={styles.muted}>, …</span>}
			{isArray ? (
				<span className={styles.brace}>]</span>
			) : (
				<span className={styles.brace}>{"}"}</span>
			)}
		</span>
	);
});

const PrimitiveValue = memo(function PrimitiveValue({ value }: { value: unknown }) {
	return (
		<span
			className={[
				typeof value === "string" && styles.string,
				(typeof value === "number" || typeof value === "bigint") && styles.number,
				typeof value === "boolean" && styles.boolean,
				(value === null || value === undefined) && styles.nullValue,
			]
				.filter(Boolean)
				.join(" ")}
		>
			{formatPrimitive(value)}
		</span>
	);
});

const Chevron = memo(function Chevron({ open }: { open: boolean }) {
	return (
		<span className={styles.arrow}>
			<svg
				viewBox="0 0 24 24"
				width="12"
				height="12"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
				className={`${styles.arrowIcon} ${open ? styles.arrowOpen : ""}`}
			>
				<path d="M9 5l7 7-7 7" />
			</svg>
		</span>
	);
});

interface JsonNodeProps {
	name?: string | number;
	value: unknown;
	root?: boolean;
}

const JsonNode = memo(function JsonNode({ name, value, root }: JsonNodeProps) {
	const [expanded, setExpanded] = useState(root ?? false);
	const [shownCount, setShownCount] = useState(CHUNK_SIZE);

	const container = isContainer(value);
	const entries = useMemo(
		() => (container ? childEntries(value) : EMPTY_ENTRIES),
		[container, value],
	);
	const visibleItems = entries.slice(0, shownCount);
	const remaining = entries.length - shownCount;

	return (
		<div className={styles.node}>
			<div
				className={`${styles.row} ${container ? styles.rowBranch : ""}`}
				onClick={() => {
					if (container) {
						setExpanded(state => !state);
					}
				}}
			>
				{container ? <Chevron open={expanded} /> : <span className={styles.arrow} />}
				{name !== undefined && (
					<>
						<span className={styles.key}>{name}</span>
						<span className={styles.colon}>:</span>
					</>
				)}
				{container ? (
					expanded ? (
						<span className={styles.muted}>{Array.isArray(value) ? "[…]" : "{…}"}</span>
					) : (
						<CollapsedPreview value={value} />
					)
				) : (
					<PrimitiveValue value={value} />
				)}
			</div>
			{container && expanded && (
				<div className={styles.children}>
					{visibleItems.map(([key, child]) => (
						<JsonNode key={key} name={key} value={child} />
					))}
					{remaining > 0 && (
						<button
							type="button"
							className={styles.more}
							onClick={() => {
								setShownCount(count => count + CHUNK_SIZE);
							}}
						>
							show more {Math.min(CHUNK_SIZE, remaining)}
						</button>
					)}
					{Array.isArray(value) && (
						<div className={styles.row}>
							<span className={styles.arrow} />
							<span className={styles.muted}>length</span>
							<span className={styles.colon}>:</span>
							<span className={styles.number}>{value.length}</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
});

export function JsonTree({ value }: { value: unknown }): ReactNode {
	return (
		<div className={styles.tree}>
			<JsonNode value={value} root />
		</div>
	);
}
