export function formatTime(ts: number): string {
	const date = new Date(ts);
	const pad = (n: number, width = 2) => String(n).padStart(width, "0");
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatDuration(from: number, to: number): string {
	const ms = Math.max(0, to - from);
	if (ms < 1) {
		return "<1ms";
	}
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}

export function formatPayloadPreview(payload: unknown): string {
	if (payload === undefined) {
		return "";
	}
	if (payload === null) {
		return "null";
	}
	if (typeof payload === "string") {
		return payload;
	}
	if (
		typeof payload === "number" ||
		typeof payload === "boolean" ||
		typeof payload === "bigint"
	) {
		return String(payload);
	}
	if (typeof payload === "symbol") {
		return payload.toString();
	}
	try {
		const json = JSON.stringify(payload);
		return json.length > 160 ? `${json.slice(0, 159)}…` : json;
	} catch {
		return "[unserializable]";
	}
}

export function formatJson(payload: unknown): string {
	try {
		return JSON.stringify(payload, null, "\t") ?? "undefined";
	} catch {
		return "[unserializable]";
	}
}

const PLATFORM_LABELS: Record<string, string> = {
	"desktop-web": "Desktop",
	"mobile-web": "Mobile",
	iframe: "In frame",
	android: "Android",
	ios: "iOS",
	standalone: "Standalone",
};

export function platformLabel(platform: string): string {
	return PLATFORM_LABELS[platform] ?? platform;
}

export function shortId(clientId: string): string {
	return clientId.length > 8 ? clientId.slice(0, 8) : clientId;
}

export function relativeTime(ts: number, now = Date.now()): string {
	const seconds = Math.round((now - ts) / 1000);
	if (seconds < 5) {
		return "just now";
	}
	if (seconds < 60) {
		return `${seconds}s ago`;
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.round(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	return `${Math.round(hours / 24)}d ago`;
}
