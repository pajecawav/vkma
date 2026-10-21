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
	const connection = useVkma();
	const [section, setSection] = useState<Section>(() => {
		const stored = localStorage.getItem(SECTION_KEY);
		return stored === "execute" || stored === "clients" ? stored : "timeline";
	});

	useEffect(() => {
		localStorage.setItem(SECTION_KEY, section);
	}, [section]);

	const gate = connection.status !== "connected" ? <StatusGate connection={connection} /> : null;

	return (
		<div className="flex h-dvh flex-col">
			<TopBar status={connection.status} onReconnect={connection.reconnect} />
			<div className="flex min-h-0 flex-1 flex-col sm:flex-row">
				<Rail section={section} onSelect={setSection} />
				{gate ??
					(section === "timeline" ? (
						<Timeline events={connection.events} clients={connection.clients} />
					) : section === "execute" ? (
						<Execute
							clients={connection.clients}
							events={connection.events}
							execute={connection.execute}
						/>
					) : (
						<Clients clients={connection.clients} />
					))}
			</div>
		</div>
	);
}
