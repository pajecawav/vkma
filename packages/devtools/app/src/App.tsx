import { LucideProvider } from "lucide-react";
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
		// House lucide defaults: 16px, the stroke weight the panel always
		// drew its icons with (lucide's own default is 2).
		<LucideProvider size={16} strokeWidth={1.75}>
			<div className="flex h-dvh flex-col">
				<TopBar
					status={connection.status}
					onReconnect={connection.reconnect}
					clientBadge={embeddedClientId ? { clientId: embeddedClientId } : undefined}
				/>
				<div className="flex min-h-0 flex-1 flex-col sm:flex-row">
					<Rail section={section} sections={sections} onSelect={setSection} />
					{gate ?? (
						<>
							{/* Sections stay mounted so in-progress state (typed params,
							    pending execute, filters, expanded rows) survives tab
							    switches — inactive ones are display-none. */}
							<div
								className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "timeline" ? "" : "hidden"}`}
							>
								<Timeline
									events={connection.events}
									clients={connection.clients}
									hideClient={Boolean(embeddedClientId)}
								/>
							</div>
							<div
								className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "execute" ? "" : "hidden"}`}
							>
								<Execute
									clients={connection.clients}
									events={connection.events}
									execute={connection.execute}
									fixedClientId={embeddedClientId}
								/>
							</div>
							<div
								className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "clients" ? "" : "hidden"}`}
							>
								<Clients clients={connection.clients} />
							</div>
						</>
					)}
				</div>
			</div>
		</LucideProvider>
	);
}
