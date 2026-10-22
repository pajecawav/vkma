/**
 * Sanitize arbitrary tap payloads (app-provided `send`/event data — may be
 * Maps, Sets, BigInts, cyclic objects) into plain JSON for agent-facing RPC
 * functions. Agent/MCP functions must declare `jsonSerializable: true`, and
 * the strict JSON encoder throws DF0020 on anything that cannot round-trip —
 * so the wire types (WireEvent etc.) that the panel RPCs keep structured
 * must not be reused as-is on the MCP surface.
 */

/** "[unserializable]" stand-in for values JSON cannot express. */
export const UNSERIALIZABLE = "[unserializable]";

/**
 * Best-effort deep JSON copy: `JSON.parse(JSON.stringify(value))`. Plain
 * data round-trips unchanged; Maps/Sets become `{}`; a throw (BigInt,
 * circular ref) degrades to the {@link UNSERIALIZABLE} marker instead of
 * failing the whole call.
 */
export function toMcpJson<T>(value: T): T | typeof UNSERIALIZABLE {
	try {
		return JSON.parse(JSON.stringify(value)) as T;
	} catch {
		return UNSERIALIZABLE;
	}
}

/** Map a record of tap events, sanitizing only the app-provided payloads. */
export function sanitizeEvent<T extends object>(event: T & { payload?: unknown }): T {
	return event.payload === undefined ? event : { ...event, payload: toMcpJson(event.payload) };
}
