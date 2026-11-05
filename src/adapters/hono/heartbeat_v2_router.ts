import { Hono } from "hono";
import { heartbeatHandler } from "api/heartbeat_handler.ts";
import { adapt } from "./adapt.ts";

export default function (): Hono {
	const router = new Hono();
	router.get("/heartbeat", adapt(heartbeatHandler()));
	return router;
}
