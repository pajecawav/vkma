/**
 * The route-conflict hint: names the process that holds — or last held —
 * the profile's route.
 *
 * The profile record carries the pid of the last SUCCESSFUL attach, so a
 * run that is still fighting for its route finds the incumbent there, or
 * the ghost of a dead one while the service has not reaped the route yet.
 * Both facts call for a different next step, hence two sentences.
 */

import type { ProfileRecord } from "../core/identity.ts";

/** Whether a process with this pid exists (`EPERM` still means "exists"). */
export function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

/**
 * One sentence explaining a route conflict on behalf of the profile's
 * record; undefined when the record names nobody but `ownPid`.
 */
export function rivalHint(record: ProfileRecord | undefined, ownPid: number): string | undefined {
	const pid = record?.pid;
	if (record === undefined || pid === undefined || pid === ownPid) {
		return undefined;
	}
	const who = `process ${String(pid)}${record.startedAt === undefined ? "" : ` (started ${record.startedAt})`}`;
	if (isPidAlive(pid)) {
		return `tunnel: profile "${record.profile}" is also used by ${who} — stop it (kill ${String(pid)}), or give this run its own profile`;
	}
	return `tunnel: profile "${record.profile}" was last used by ${who}, which is no longer running — the service still holds its route; the tunnel takes it over once the service releases it`;
}
