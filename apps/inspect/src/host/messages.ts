/**
 * Zod boundary for everything crossing a DataConnection into the host:
 * an inspector page is foreign code on someone else's phone, so invalid
 * input drops silently (the same posture as the extension's werpc
 * procedures and window-message sniffers).
 */
import { clientInfoSchema, tapEventSchema } from "@vkma.dev/protocol/schemas";
import { z } from "zod";
import { MAX_EVENTS } from "../shared/config.ts";
import { PROTOCOL_VERSION } from "../shared/protocol.ts";

const v = z.literal(PROTOCOL_VERSION);

export const challengeMessageSchema = z.object({
	v,
	t: z.literal("challenge"),
	nonce: z.string().regex(/^[A-Za-z0-9_-]{40,512}$/),
});

export const helloMessageSchema = z.object({
	v,
	t: z.literal("hello"),
	info: clientInfoSchema,
});

export const eventsMessageSchema = z.object({
	v,
	t: z.literal("events"),
	clientId: z.string().max(256),
	events: z.array(tapEventSchema).max(MAX_EVENTS),
});

export const execResultMessageSchema = z.object({
	v,
	t: z.literal("exec-result"),
	execId: z.number(),
	clientId: z.string().max(256),
	ok: z.boolean(),
	payload: z.unknown().optional(),
});

export const inspectorMessageSchema = z.discriminatedUnion("t", [
	challengeMessageSchema,
	helloMessageSchema,
	eventsMessageSchema,
	execResultMessageSchema,
]);

export type ParsedChallenge = z.infer<typeof challengeMessageSchema>;
export type ParsedHello = z.infer<typeof helloMessageSchema>;
export type ParsedEvents = z.infer<typeof eventsMessageSchema>;
export type ParsedExecResult = z.infer<typeof execResultMessageSchema>;
export type ParsedInspectorMessage =
	| ParsedChallenge
	| ParsedHello
	| ParsedEvents
	| ParsedExecResult;

/** @returns the message, or undefined for anything malformed. */
export function parseInspectorMessage(data: unknown): ParsedInspectorMessage | undefined {
	if (typeof data !== "object" || data === null) {
		return undefined;
	}
	const parsed = inspectorMessageSchema.safeParse(data);
	return parsed.success ? parsed.data : undefined;
}
