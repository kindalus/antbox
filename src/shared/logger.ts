type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
};

function getLogLevel(): number {
	const envLevel = Deno.env.get("ANTBOX_LOG_LEVEL")?.toLowerCase() as LogLevel | undefined;
	return LOG_LEVELS[envLevel ?? "info"] ?? LOG_LEVELS.info;
}

export class Logger {
	static debug(...args: unknown[]): void {
		if (getLogLevel() <= LOG_LEVELS.debug) {
			console.debug("[DEBUG]", ...args);
		}
	}

	static info(...args: unknown[]): void {
		if (getLogLevel() <= LOG_LEVELS.info) {
			console.info("[INFO]", ...args);
		}
	}

	static warn(...args: unknown[]): void {
		if (getLogLevel() <= LOG_LEVELS.warn) {
			console.warn("[WARN]", ...args);
		}
	}

	static error(...args: unknown[]): void {
		if (getLogLevel() <= LOG_LEVELS.error) {
			console.error("[ERROR]", ...args);
		}
	}

	static fatal(...args: unknown[]): void {
		if (getLogLevel() <= LOG_LEVELS.fatal) {
			console.error("[FATAL]", ...args);
		}
	}
}
