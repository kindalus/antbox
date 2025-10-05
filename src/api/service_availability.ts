import { sendServiceUnavailable } from "./handler.ts";

/**
 * Standard error response for when a service is not available
 */
export class ServiceUnavailableError extends Error {
	constructor(serviceName: string) {
		super(`${serviceName} not available for this tenant`);
		this.name = "ServiceUnavailableError";
	}
}

/**
 * Check if a service is available and throw if not
 */
export function requireService<T>(
	service: T | undefined,
	serviceName: string,
): asserts service is T {
	if (!service) {
		throw new ServiceUnavailableError(serviceName);
	}
}

/**
 * Check if a service is available and return error response if not
 */
export function checkServiceAvailability<T>(
	service: T | undefined,
	serviceName: string,
): Response | null {
	if (!service) {
		return sendServiceUnavailable({
			error: `${serviceName} not available for this tenant`,
		});
	}
	return null;
}
