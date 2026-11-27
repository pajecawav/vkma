/**
 * Which client a sniffed app → host envelope belongs to.
 *
 * The sender itself has to be a known mini app frame: the origin the
 * browser put on the message must be one a collector said hello from. An
 * envelope from any other origin is a relay (an adapter passing the app's
 * envelopes on up to the top window) or a frame with no collector, and in
 * both cases the original is not that message: the app's own parent
 * reported it already. Dropping those is also what keeps ads and service
 * iframes out of the timeline.
 *
 * The frame id only refines a known origin: several frames of one app
 * share it, and the id the host assigned over VKWebAppSettings tells
 * them apart.
 */
export class EnvelopeAttributor {
	private readonly byFrameId = new Map<string, string>();
	private readonly byOrigin = new Map<string, string>();

	/** A collector said hello: this frame id (when the host assigned one)
	 * and this origin are its client's. */
	public register(clientId: string, webFrameId: string | undefined, origin: string): void {
		if (webFrameId !== undefined) {
			this.byFrameId.set(webFrameId, clientId);
		}
		this.byOrigin.set(origin, clientId);
	}

	public attribute(webFrameId: string | undefined, origin: string): string | undefined {
		const byOrigin = this.byOrigin.get(origin);
		if (byOrigin === undefined) {
			return undefined;
		}
		return (webFrameId === undefined ? undefined : this.byFrameId.get(webFrameId)) ?? byOrigin;
	}
}
