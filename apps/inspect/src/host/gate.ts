/**
 * The approve gate: every inspector connection parks until the human
 * behind the panel lets it in. ON by default — a leaked peer id (a
 * committed script tag is the realistic leak) grants `vkma:state` with
 * launch params (`sign`, `access_token`), so the default posture is
 * "prove a phone is actually connecting".
 *
 * "Always allow" remembers a clientId (the phone keeps it in
 * sessionStorage across reloads, so the friction is once per page
 * lifetime); denials live for this panel load only — a denied page that
 * reconnects just re-appears as pending. Denying a remembered id also
 * revokes its persisted grant: the deny gesture must survive reloads
 * exactly like the grant does.
 */

const GATE_KEY = "vkma:inspect:gate";
const APPROVED_KEY = "vkma:inspect:approved";
const APPROVED_CAP = 32;

function readStore(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStore(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// best effort only
	}
}

function readApproved(): string[] {
	try {
		const parsed: unknown = JSON.parse(readStore(APPROVED_KEY) ?? "[]");
		return Array.isArray(parsed)
			? parsed.filter((id): id is string => typeof id === "string")
			: [];
	} catch {
		return [];
	}
}

export class Gate {
	/** In-memory denials for this panel load. */
	private readonly denied = new Set<string>();

	/** The gate defaults to ON — the security posture is the product. */
	public isEnabled(): boolean {
		return readStore(GATE_KEY) !== "0";
	}

	public setEnabled(enabled: boolean): void {
		writeStore(GATE_KEY, enabled ? "1" : "0");
	}

	public isApproved(clientId: string): boolean {
		return readApproved().includes(clientId);
	}

	public approve(clientId: string, remember: boolean): void {
		if (!remember) {
			return;
		}
		const next = [clientId, ...readApproved().filter(id => id !== clientId)].slice(
			0,
			APPROVED_CAP,
		);
		writeStore(APPROVED_KEY, JSON.stringify(next));
	}

	/**
	 * A denial is a revocation: the persisted "Always allow" grant must
	 * die with it, or a reload re-admits the denied principal silently
	 * (the in-memory set below masks it for this panel load only).
	 */
	public deny(clientId: string): void {
		this.denied.add(clientId);
		const next = readApproved().filter(id => id !== clientId);
		writeStore(APPROVED_KEY, JSON.stringify(next));
	}

	/** Rotate: trust is re-anchored to a fresh capability — remembered
	 * approvals from the old world must not survive it. */
	public clearApproved(): void {
		writeStore(APPROVED_KEY, "[]");
	}

	public isDenied(clientId: string): boolean {
		return this.denied.has(clientId);
	}
}
