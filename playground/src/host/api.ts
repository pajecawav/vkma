import {
	UsersGetResponseSchema,
	type UsersGetResponseSchema as UsersGetResponse,
} from "@vkma.dev/api-schema/valibot/users/responses";
import type { UserGetFriendsFriend, UserInfo } from "@vkma.dev/bridge";
import * as v from "valibot";

export type FakeUsersGetResponse = UsersGetResponse;
export type FakeUser = FakeUsersGetResponse[number];

const CAMERA_100 = "https://vk.ru/images/camera_100.png";
const CAMERA_200 = "https://vk.ru/images/camera_200.png";
const CAMERA_MAX = "https://vk.ru/images/camera_400.png";

// This is the response payload of users.get, not a hand-written bridge type.
// Parsing it at module init makes the fake exercise the generated schema too.
const usersGetResponse = [
	{
		id: 743101,
		first_name: "Александр",
		last_name: "Соколов",
		screen_name: "alex.planner",
		sex: 2,
		bdate: "14.05.1994",
		city: { id: 1, title: "Москва" },
		timezone: 3,
		photo_100: CAMERA_100,
		photo_200: CAMERA_200,
		photo_max_orig: CAMERA_MAX,
		is_closed: false,
		can_access_closed: true,
		online: 1,
		verified: 1,
	},
	{
		id: 743102,
		first_name: "Дарья",
		last_name: "Морозова",
		screen_name: "daria.morozova",
		sex: 1,
		bdate: "22.09.1996",
		city: { id: 2, title: "Санкт-Петербург" },
		timezone: 3,
		photo_100: CAMERA_100,
		photo_200: CAMERA_200,
		photo_max_orig: CAMERA_MAX,
		is_closed: false,
		can_access_closed: true,
		online: 1,
	},
	{
		id: 743103,
		first_name: "Михаил",
		last_name: "Волков",
		screen_name: "mikhail.volkov",
		sex: 2,
		city: { id: 1, title: "Москва" },
		timezone: 3,
		photo_100: CAMERA_100,
		photo_200: CAMERA_200,
		is_closed: false,
		can_access_closed: true,
		online: 0,
	},
	{
		id: 743104,
		first_name: "Анна",
		last_name: "Лебедева",
		screen_name: "anna.lebedeva",
		sex: 1,
		bdate: "03.02.1998",
		city: { id: 99, title: "Казань" },
		timezone: 3,
		photo_100: CAMERA_100,
		photo_200: CAMERA_200,
		is_closed: false,
		can_access_closed: true,
		online: 1,
	},
	{
		id: 743105,
		first_name: "Илья",
		last_name: "Кузнецов",
		screen_name: "ilya.kuznetsov",
		sex: 2,
		city: { id: 158, title: "Новосибирск" },
		timezone: 7,
		photo_100: CAMERA_100,
		photo_200: CAMERA_200,
		is_closed: true,
		can_access_closed: true,
		online: 0,
	},
];

/** Typed users.get result: the current user followed by exactly four friends. */
export const users: FakeUsersGetResponse = v.parse(UsersGetResponseSchema, usersGetResponse);

if (users.length !== 5 || !users[0]) {
	throw new Error("The fake users.get response must contain the current user and four friends");
}

export const currentUser: FakeUser = users[0];
export const friends: FakeUsersGetResponse = users.slice(1);

export function findFakeUser(userId: number): FakeUser | undefined {
	return users.find(user => user.id === userId);
}

/** Adapt the API object to the richer, historical VKWebAppGetUserInfo shape. */
export function toUserInfo(user: FakeUser): UserInfo {
	return {
		id: user.id,
		first_name: user.first_name ?? "VK",
		last_name: user.last_name ?? "User",
		sex: user.sex ?? 0,
		bdate: user.bdate,
		bdate_visibility: user.bdate ? 1 : 0,
		city: user.city ?? { id: 1, title: "Москва" },
		country: { id: 1, title: "Россия" },
		photo_100: user.photo_100 || CAMERA_100,
		photo_200: user.photo_200 || CAMERA_200,
		photo_max_orig: user.photo_max_orig || CAMERA_MAX,
		is_closed: user.is_closed ?? false,
		can_access_closed: user.can_access_closed ?? true,
		timezone: user.timezone ?? 3,
	};
}

export function toFriendInfo(user: FakeUser): UserGetFriendsFriend {
	return {
		id: user.id,
		first_name: user.first_name ?? "VK",
		last_name: user.last_name ?? "User",
		sex: user.sex ?? 0,
		photo_200: user.photo_200 || CAMERA_200,
	};
}
