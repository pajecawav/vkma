import type { CSSProperties, ReactElement } from "react";

/** VKUI Avatar has no initials mode — a deterministic initials disc. */
export function InitialsAvatar({
	name,
	color,
	size = 40,
}: {
	name: string;
	color: string;
	size?: number;
}): ReactElement {
	const initials = name
		.split(" ")
		.map(word => word.charAt(0))
		.slice(0, 2)
		.join("");
	const style: CSSProperties = {
		width: size,
		height: size,
		borderRadius: "50%",
		background: color,
		color: "#fff",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontWeight: 600,
		fontSize: Math.round(size * 0.36),
		flexShrink: 0,
		userSelect: "none",
	};
	return <div style={style}>{initials}</div>;
}
