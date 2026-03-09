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
	readonly #prefixes: string[];

	private constructor(prefixes: string[] = []) {
		this.#prefixes = prefixes;
	}

	static instance(...prefixes: string[]): Logger {
		return new Logger(prefixes.filter((prefix) => prefix.trim().length > 0));
	}

	static #emit(level: LogLevel, prefixes: string[], ...args: unknown[]): void {
		if (getLogLevel() > LOG_LEVELS[level]) {
			return;
		}

		const prefixText = prefixes.map((prefix) => `[${prefix}]`).join(" ");
		const output = prefixText ? [prefixText, ...args] : args;

		switch (level) {
			case "debug":
				console.debug("[DEBUG]", ...output);
				break;
			case "info":
				console.info("[INFO]", ...output);
				break;
			case "warn":
				console.warn("[WARN]", ...output);
				break;
			case "error":
				console.error("[ERROR]", ...output);
				break;
			case "fatal":
				console.error("[FATAL]", ...output);
				break;
		}
	}

	static debug(...args: unknown[]): void {
		Logger.#emit("debug", [], ...args);
	}

	static info(...args: unknown[]): void {
		Logger.#emit("info", [], ...args);
	}

	static warn(...args: unknown[]): void {
		Logger.#emit("warn", [], ...args);
	}

	static error(...args: unknown[]): void {
		Logger.#emit("error", [], ...args);
	}

	static fatal(...args: unknown[]): void {
		Logger.#emit("fatal", [], ...args);
	}

	debug(...args: unknown[]): void {
		Logger.#emit("debug", this.#prefixes, ...args);
	}

	info(...args: unknown[]): void {
		Logger.#emit("info", this.#prefixes, ...args);
	}

	warn(...args: unknown[]): void {
		Logger.#emit("warn", this.#prefixes, ...args);
	}

	error(...args: unknown[]): void {
		Logger.#emit("error", this.#prefixes, ...args);
	}

	fatal(...args: unknown[]): void {
		Logger.#emit("fatal", this.#prefixes, ...args);
	}
}
