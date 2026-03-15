import { type HttpHandler, sendOK } from "./handler.ts";

export function heartbeatHandler(): HttpHandler {
	return (_req: Request): Promise<Response> => {
		return Promise.resolve(sendOK({ status: "ok", timestamp: new Date().toISOString() }));
	};
}
