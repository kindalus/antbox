export type PiCodingAgentModule = typeof import("@earendil-works/pi-coding-agent");

let modulePromise: Promise<PiCodingAgentModule> | undefined;

/** Loads the Pi SDK once and shares the module between callers. */
export function loadPiCodingAgent(): Promise<PiCodingAgentModule> {
	modulePromise ??= import("@earendil-works/pi-coding-agent");
	return modulePromise;
}
