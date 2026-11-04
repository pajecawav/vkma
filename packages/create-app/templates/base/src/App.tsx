import bridge from "@vkma.dev/bridge";
import { useEffect, useState } from "react";

async function fetchUser() {
	return bridge.send("VKWebAppGetUserInfo");
}

/**
 * The minimal bridge demo: a typed `send` (request → response) and a page
 * subscription to host events (`subscribe` returns its own off, a perfect
 * useEffect cleanup).
 */
export function App() {
	const [user, setUser] = useState<Awaited<ReturnType<typeof fetchUser>> | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [lastEvent, setLastEvent] = useState<string | null>(null);

	useEffect(
		() =>
			bridge.subscribe(event => {
				setLastEvent(event.detail.type);
			}),
		[],
	);

	const loadUser = async () => {
		try {
			setError(null);
			setUser(await fetchUser());
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	return (
		<main className="app">
			<h1>VK Mini App</h1>
			<p className="hint">
				Open the devtools panel at <code>/__vkma/</code> to watch every bridge event.
			</p>

			<button type="button" onClick={() => void loadUser()}>
				VKWebAppGetUserInfo
			</button>

			{user !== null && (
				<p className="card">
					{user.first_name} {user.last_name} · id {user.id}
				</p>
			)}
			{error !== null && <p className="card error">{error}</p>}

			<p className="hint">Last host event: {lastEvent ?? "—"}</p>
		</main>
	);
}
