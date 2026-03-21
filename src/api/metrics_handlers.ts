import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";

export function getStorageUsageHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);

			// Optional: Protect via admin/system user check if needed.
			// Assuming general access or managed by an API key.

			const service = tenant.metricsService;
			const unavailable = checkServiceAvailability(service, "metricsService");
			if (unavailable) {
				return unavailable;
			}

			const result = await service.getStorageUsage();
			return processServiceResult(result);
		},
	);
}

export function getTokenUsageHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const query = getQuery(req);

			const yearStr = query["year"];
			const monthStr = query["month"];

			if (!yearStr || !monthStr) {
				return sendBadRequest("Missing required query parameters: year, month");
			}

			const year = parseInt(yearStr as string, 10);
			const month = parseInt(monthStr as string, 10);

			if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
				return sendBadRequest("Invalid year or month parameters");
			}

			const service = tenant.metricsService;
			const unavailable = checkServiceAvailability(service, "metricsService");
			if (unavailable) {
				return unavailable;
			}

			const result = await service.getTokenUsage(year, month);
			return processServiceResult(result);
		},
	);
}
