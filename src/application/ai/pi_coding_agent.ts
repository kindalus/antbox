import { createRequire } from "node:module";

export type PiCodingAgentModule = typeof import("@earendil-works/pi-coding-agent");

let modulePromise: Promise<PiCodingAgentModule> | undefined;

/**
 * Loads the Pi SDK after installing the Node compatibility missing from Deno.
 *
 * Undici 8 expects worker_threads.markAsUncloneable(), which Deno 2.7 does not expose.
 * The marker only affects Node structured-clone diagnostics, so a no-op is sufficient here.
 */
export function loadPiCodingAgent(): Promise<PiCodingAgentModule> {
	if (!modulePromise) {
		const require = createRequire(import.meta.url);
		const workerThreads = require("node:worker_threads") as {
			markAsUncloneable?: (value: object) => void;
		};
		workerThreads.markAsUncloneable ??= () => {};
		modulePromise = import("@earendil-works/pi-coding-agent");
	}
	return modulePromise;
}
