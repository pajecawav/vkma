/**
 * Zod boundary for everything crossing a DataConnection into the host:
 * an inspector page is foreign code on someone else's phone, so invalid
 * input drops silently (the same posture as the extension's werpc
 * procedures and window-message sniffers).
 */
import { clientInfoSchema, tapEventSchema } from "@vkma.dev/protocol/schemas";
import { z } from "zod";
import { PROTOCOL_VERSION } from "../shared/protocol.ts";

const v = z.literal(PROTOCOL_VERSION);

export const helloMessageSchema = z.object({
	v,
	t: z.literal("hello"),
	info: clientInfoSchema,
});

export const eventsMessageSchema = z.object({
	v,
	t: z.literal("events"),
	clientId: z.string(),
	events: z.array(tapEventSchema),
});

export const execResultMessageSchema = z.object({
	v,
	t: z.literal("exec-result"),
	execId: z.number(),
	clientId: z.string(),
	ok: z.boolean(),
	payload: z.unknown().optional(),
});

export const inspectorMessageSchema = z.discriminatedUnion("t", [
	helloMessageSchema,
	eventsMessageSchema,
	execResultMessageSchema,
]);

export type ParsedHello = z.infer<typeof helloMessageSchema>;
export type ParsedEvents = z.infer<typeof eventsMessageSchema>;
export type ParsedExecResult = z.infer<typeof execResultMessageSchema>;
export type ParsedInspectorMessage = ParsedHello | ParsedEvents | ParsedExecResult;

/** @returns the message, or undefined for anything malformed. */
export function parseInspectorMessage(data: unknown): ParsedInspectorMessage | undefined {
	if (typeof data !== "object" || data === null) {
		return undefined;
	}
	const parsed = inspectorMessageSchema.safeParse(data);
	return parsed.success ? parsed.data : undefined;
}
