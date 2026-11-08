import { Avatar, type AvatarProps } from "@vkontakte/vkui";
import type { ReactElement } from "react";

export function InitialsAvatar({ name, size = 40 }: { name: string; size?: number }): ReactElement {
	const initials = name
		.split(" ")
		.map(word => word.charAt(0))
		.slice(0, 2)
		.join("");
	const gradientColor = (Array.from(initials).reduce(
		(total, character) => total + character.charCodeAt(0),
		0,
	) % 6) as AvatarProps["gradientColor"];

	return <Avatar initials={initials} size={size} gradientColor={gradientColor} />;
}
