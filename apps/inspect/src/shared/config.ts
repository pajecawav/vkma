/**
 * Deployment-shaped constants of the inspect transport. The signaling
 * host is a constant so a future self-hosted broker (same origin as the
 * app) is a one-line switch — until then the public PeerJS cloud brokers
 * offers, and the data itself never leaves the DTLS DataChannel.
 *
 * ICE policy is deliberate and load-bearing: STUN-only, and TURN is not
 * in the config at any value — relay servers are architecturally absent,
 * so a pair that cannot connect directly fails honestly (LAN always
 * works; many LTE↔broadband pairs do via STUN; symmetric NAT does not).
 */
import type { PeerOptions } from "peerjs";

export const ICE_SERVERS: NonNullable<PeerOptions["config"]>["iceServers"] = [
	{ urls: "stun:stun.l.google.com:19302" },
];

export const SIGNALING: Pick<PeerOptions, "host" | "secure" | "port"> = {
	host: "0.peerjs.com",
	secure: true,
	port: 443,
};

/** Collector heartbeat — also the host's online TTL clock (15 s). */
export const HEARTBEAT_MS = 5_000;
/** Event batch cadence (the devtools collector's flush rhythm). */
export const FLUSH_MS = 250;
/** The duplicate-tab claim handshake window before first use of an id. */
export const CLAIM_WINDOW_MS = 180;
/** How long the collector waits for `__vkmaDevtoolsBridge` before spy
 * mode is final (matches the devtools/extension collectors). */
export const BRIDGE_WAIT_MS = 10_000;
/** Reconnect backoff bounds for the inspector's dial loop. */
export const RECONNECT_MIN_MS = 500;
export const RECONNECT_MAX_MS = 10_000;
/** Messages parked while a connection awaits gate approval. */
export const MAX_PENDING_BUFFER = 200;
/** How long the inspector waits for the panel's challenge-proof before
 * dropping the dial (the answerer cannot sign — it is not the panel). */
export const VERIFICATION_TIMEOUT_MS = 5_000;
/** Ceiling on simultaneously parked DataConnections — no admission
 * capacity without an operator to answer the approval cards. */
export const MAX_CONNS = 24;
/** Byte budget for one connection's parked messages (the message-count
 * cap alone lets a single oversized hello park megabytes). */
export const MAX_PARKED_BYTES = 256 * 1024;

/** Peer id shape: `vkma-inspect-` + 26 URL-safe chars (~128 bits). The id
 * IS the capability — anyone holding it can connect as an inspector. */
export const PEER_ID_PREFIX = "vkma-inspect-";
export const PEER_ID_RANDOM_LENGTH = 26;
