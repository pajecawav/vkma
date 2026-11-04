import { catalogue, stubs } from "@vkma.dev/bridge-schema/catalogue";
import {
	Clients,
	Execute,
	FabPositionControl,
	Rail,
	type Section,
	Timeline,
	TopBar,
	UiProvider,
} from "@vkma.dev/ui";
import { useEffect, useState } from "react";
import { StatusGate } from "./components/StatusGate.tsx";
import { useFabPosition } from "./lib/fab-position.ts";
import { useIgnoredEventsSettings } from "./lib/ignored-events.ts";
import { useVkma } from "./lib/rpc.ts";

// Sorted once at module scope; the catalogue is frozen data.
const SUGGESTED_EVENTS = Object.keys(catalogue.props).toSorted((a, b) => a.localeCompare(b));

// The ignore editor suggests every name the catalogue knows: request
// methods AND receive events (the noisiest rows are receive-side).
const IGNORE_SUGGESTIONS = [
	...Object.keys(catalogue.props),
	...Object.keys(catalogue.receive),
].toSorted((a, b) => a.localeCompare(b));

const SECTION_KEY = "vkma:section";

export function App() {
	// When the panel is embedded on a mini app page (the FAB iframe appends
	// ?client=<id>), it scopes itself to that client and hides the registry.
	const embeddedClientId = new URLSearchParams(window.location.search).get("client") ?? undefined;

	const connection = useVkma(embeddedClientId);
	const fabPosition = useFabPosition();
	const ignoredEvents = useIgnoredEventsSettings();
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
		<UiProvider>
			<div className="flex h-dvh flex-col">
				<TopBar
					status={connection.status}
					onReconnect={connection.reconnect}
					clientBadge={embeddedClientId ? { clientId: embeddedClientId } : undefined}
					actions={
						// The placement controls the in-page FAB; only the
						// embedded panel (mounted by that FAB) shows it.
						embeddedClientId ? (
							<FabPositionControl
								position={fabPosition.position}
								onPick={fabPosition.pick}
							/>
						) : undefined
					}
				/>
				<div className="flex min-h-0 flex-1 flex-col sm:flex-row">
					<Rail section={section} sections={sections} onSelect={setSection} />
					{gate ?? (
						<>
							{/* Sections stay mounted so in-progress state (typed params,
							    pending execute, filters, expanded rows) survives tab
							    switches; inactive ones are display-none. */}
							<div
								className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "timeline" ? "" : "hidden"}`}
							>
								<Timeline
									events={connection.events}
									clients={connection.clients}
									hideClient={Boolean(embeddedClientId)}
									ignoredEvents={{
										settings: ignoredEvents.settings,
										onChange: ignoredEvents.save,
										suggestions: IGNORE_SUGGESTIONS,
									}}
								/>
							</div>
							<div
								className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "execute" ? "" : "hidden"}`}
							>
								<Execute
									clients={connection.clients}
									events={connection.events}
									execute={connection.execute}
									suggestedEvents={SUGGESTED_EVENTS}
									paramsStub={name => stubs[name]}
									fixedClientId={embeddedClientId}
								/>
							</div>
							<div
								className={`flex min-h-0 min-w-0 flex-1 flex-col ${section === "clients" ? "" : "hidden"}`}
							>
								<Clients
									clients={connection.clients}
									onDeleteClient={clientId => {
										void connection.deleteClients([clientId]).catch(() => {});
									}}
								/>
							</div>
						</>
					)}
				</div>
			</div>
		</UiProvider>
	);
}
