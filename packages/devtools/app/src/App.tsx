import { useEffect, useState } from "react";
import { Clients } from "./components/Clients.tsx";
import { Execute } from "./components/Execute.tsx";
import { Rail, type Section } from "./components/Rail.tsx";
import { StatusGate } from "./components/StatusGate.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { useVkma } from "./lib/rpc.ts";

const SECTION_KEY = "vkma:section";

export function App() {
	// When the panel is embedded on a mini app page (the FAB iframe appends
	// ?client=<id>), it scopes itself to that client and hides the registry.
	const embeddedClientId = new URLSearchParams(window.location.search).get("client") ?? undefined;

	const connection = useVkma(embeddedClientId);
	const [section, setSection] = useState<Section>(() => {
		const stored = localStorage.getItem(SECTION_KEY);
		return stored === "execute" || stored === "clients" ? stored : "timeline";
	});

	useEffect(() => {
		localStorage.setItem(SECTION_KEY, section);
	}, [section]);

	const sections: Section[] = embeddedClientId
		? ["timeline", "execute"]
		: ["timeline", "execute", "clients"];

	const gate = connection.status !== "connected" ? <StatusGate connection={connection} /> : null;

	return (
		<div className="flex h-dvh flex-col">
			<TopBar
				status={connection.status}
				onReconnect={connection.reconnect}
				clientBadge={embeddedClientId ? { clientId: embeddedClientId } : undefined}
			/>
			<div className="flex min-h-0 flex-1 flex-col sm:flex-row">
				<Rail section={section} sections={sections} onSelect={setSection} />
				{gate ??
					(section === "timeline" ? (
						<Timeline
							events={connection.events}
							clients={connection.clients}
							hideClient={Boolean(embeddedClientId)}
						/>
					) : section === "execute" ? (
						<Execute
							clients={connection.clients}
							events={connection.events}
							execute={connection.execute}
							fixedClientId={embeddedClientId}
						/>
					) : (
						<Clients clients={connection.clients} />
					))}
			</div>
		</div>
	);
}
