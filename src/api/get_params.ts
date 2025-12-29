import { Logger } from "shared/logger.ts";

export function getParams(req: Request): Record<string, string> {
	try {
		const params = JSON.parse(req.headers.get("x-params") || "{}");
		return params;
	} catch (e) {
		Logger.error("Error parsing x-params header:", e);
		return {};
	}
}
