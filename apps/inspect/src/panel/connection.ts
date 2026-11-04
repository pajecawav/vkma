import type { ClientStatus, ConnectionStatus, ExecResult, WireEvent } from "@vkma.dev/protocol";
import { useCallback, useEffect, useState } from "react";
import type { ApprovalRequest, InspectRuntime } from "../host/runtime.ts";
import { absorbEvents } from "./absorb.ts";

/**
 * The panel's data layer, the extension adapter's in-process
 * counterpart. Panel and store share one page, so this subscribes to
 * the host's hubs directly (no RPC of any kind in between); the shape
 * stays the `PanelConnection` contract every vkma panel consumes.
 */

/** The inspect panel never runs the devtools OTP dance. */
export type InspectStatus = Exclude<ConnectionStatus, "unauthorized">;

export interface InspectConnection {
	status: InspectStatus;
	events: WireEvent[];
	clients: ClientStatus[];
	lastError?: string;
	execute: (
		clientId: string,
		name: string,
		params: Record<string, unknown> | undefined,
	) => Promise<ExecResult>;
	deleteClients: (clientIds: string[]) => Promise<string[]>;
	/** Gate state and the parked connections waiting on the human. */
	gateEnabled: boolean;
	approvals: ApprovalRequest[];
	approve: (clientId: string, remember: boolean) => void;
	deny: (clientId: string) => void;
	setGateEnabled: (enabled: boolean) => void;
	/** Setup screen inputs. */
	peerId: string | undefined;
	scriptUrl: string;
	/** Whether fresh tabs adopt this id (snippet stability, opt-in). */
	pinned: boolean;
	setPinned: (pinned: boolean) => void;
	rotate: () => void;
	reconnect: () => void;
}

export function useInspect(runtime: InspectRuntime): InspectConnection {
	const { host } = runtime;

	const [events, setEvents] = useState<WireEvent[]>(() => host.snapshot().events);
	const [clients, setClients] = useState<ClientStatus[]>(() => host.snapshot().clients);
	const [approvals, setApprovals] = useState<ApprovalRequest[]>(() => host.pendingApprovals());
	const [gateEnabled, setGateEnabledState] = useState(() => host.isGateEnabled());
	const [peerStatus, setPeerStatus] = useState(() => runtime.peerStatus());
	const [peerId, setPeerId] = useState(() => runtime.peerId());
	const [publicKey, setPublicKey] = useState(() => runtime.publicKey());
	const [pinned, setPinnedState] = useState(() => runtime.pinned());

	// The id and the signing key settle before the peer starts, so we
	// pick them up once.
	useEffect(() => {
		if (peerId === undefined || publicKey === undefined) {
			const timer = setInterval(() => {
				const id = runtime.peerId();
				const key = runtime.publicKey();
				if (id !== undefined) {
					setPeerId(id);
				}
				if (key !== undefined) {
					setPublicKey(key);
				}
				if (id !== undefined && key !== undefined) {
					clearInterval(timer);
				}
			}, 100);
			return () => clearInterval(timer);
		}
		return undefined;
	}, [peerId, publicKey, runtime]);

	useEffect(() => {
		const offTimeline = host.timelineHub.subscribe(batch => {
			setEvents(prev => absorbEvents(prev, batch));
		});
		const offClients = host.clientsHub.subscribe(next => setClients(next));
		const offSessionReset = host.sessionResetHub.subscribe(({ clientId }) => {
			setEvents(prev => prev.filter(event => event.clientId !== clientId));
		});
		const offApprovals = host.approvalsHub.subscribe(next => setApprovals(next));
		const offStatus = runtime.statusHub.subscribe(next => setPeerStatus(next));
		return () => {
			offTimeline();
			offClients();
			offSessionReset();
			offApprovals();
			offStatus();
		};
	}, [host, runtime]);

	const execute = useCallback<InspectConnection["execute"]>(
		(clientId, name, params) => host.execute(clientId, name, params),
		[host],
	);

	const deleteClients = useCallback<InspectConnection["deleteClients"]>(
		clientIds => Promise.resolve(host.deleteClients(clientIds)),
		[host],
	);

	const approve = useCallback<InspectConnection["approve"]>(
		(clientId, remember) => host.approve(clientId, remember),
		[host],
	);

	const deny = useCallback<InspectConnection["deny"]>(clientId => host.deny(clientId), [host]);

	const setGateEnabled = useCallback<InspectConnection["setGateEnabled"]>(
		enabled => {
			host.setGateEnabled(enabled);
			setGateEnabledState(enabled);
		},
		[host],
	);

	const rotate = useCallback(() => {
		runtime.rotate();
		setPeerId(runtime.peerId());
	}, [runtime]);

	const setPinned = useCallback(
		(pin: boolean) => {
			runtime.setPinned(pin);
			setPinnedState(pin);
		},
		[runtime],
	);

	const reconnect = useCallback(() => runtime.reconnect(), [runtime]);

	const status: InspectStatus =
		peerStatus.state === "online"
			? "connected"
			: peerStatus.state === "starting"
				? "connecting"
				: "error";

	const scriptUrl =
		peerId === undefined || publicKey === undefined
			? "/inspector.js"
			: `${window.location.origin}/inspector.js?id=${peerId}&k=${publicKey}`;

	return {
		status,
		events,
		clients,
		lastError: peerStatus.lastError,
		execute,
		deleteClients,
		gateEnabled,
		approvals,
		approve,
		deny,
		setGateEnabled,
		peerId,
		scriptUrl,
		pinned,
		setPinned,
		rotate,
		reconnect,
	};
}
