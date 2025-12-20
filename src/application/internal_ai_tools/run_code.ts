import type { NodeServiceProxy } from "application/node_service_proxy.ts";
import type { AspectServiceProxy } from "application/aspect_service_proxy.ts";

export interface RunCodeSDKs {
	nodes: NodeServiceProxy;
	aspects: AspectServiceProxy;
	custom: unknown;
}

export type RunCodeFunction = (code: string) => Promise<string>;

/**
 * Factory function that creates a runCode tool with bound SDK instances.
 *
 * @param nodes - NodeServiceProxy instance
 * @param aspects - AspectServiceProxy instance
 * @param custom - Custom object with additional APIs
 * @returns A function that executes user-provided TypeScript/JavaScript code
 */
export function createRunCodeTool(
	nodes: NodeServiceProxy,
	aspects: AspectServiceProxy,
	custom: unknown,
): RunCodeFunction {
	const sdks: RunCodeSDKs = {
		nodes,
		aspects,
		custom,
	};

	return async function runCode(code: string): Promise<string> {
		try {
			// Create a data URL module with the user's code
			// The code must export a default function
			const moduleUrl = `data:text/typescript,${encodeURIComponent(code)}`;

			// Dynamically import the module
			const module = await import(moduleUrl);

			// Get the default export (should be a function)
			const defaultFn = module.default;

			if (typeof defaultFn !== "function") {
				throw new Error(
					"Module must export a default function that accepts SDKs and returns Promise<string>",
				);
			}

			// Execute the function with the SDKs
			const result = await defaultFn(sdks);

			// Handle the result based on its type
			if (typeof result === "string") {
				return result;
			}

			// Convert objects to JSON string
			return JSON.stringify(result, null, 2);
		} catch (error) {
			// Convert error to JSON string with stack trace
			const errorObj = {
				error: true,
				name: error instanceof Error ? error.name : "Error",
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			};

			return JSON.stringify(errorObj, null, 2);
		}
	};
}
