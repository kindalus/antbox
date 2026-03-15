import { Router } from "@oak/oak";
import { heartbeatHandler } from "api/heartbeat_handler.ts";
import { adapt } from "./adapt.ts";

export default function (): Router {
	const router = new Router();
	router.get("/heartbeat", adapt(heartbeatHandler()));
	return router;
}
