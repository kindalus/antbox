import { type AntboxTenant } from "api/antbox_tenant.ts";
import {
	answerHandler,
	chatHandler,
	createOrReplaceAgentHandler,
	deleteAgentHandler,
	getAgentHandler,
	listAgentsHandler,
	ragChatHandler,
} from "api/agents_handlers.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = createRouter();

	// CRUD operations
	router.post("/-/upload", adapt(createOrReplaceAgentHandler(tenants)));
	router.get("/", adapt(listAgentsHandler(tenants)));
	router.get("/:uuid", adapt(getAgentHandler(tenants)));
	router.delete("/:uuid", adapt(deleteAgentHandler(tenants)));

	// RAG operations
	router.post("/rag/-/chat", adapt(ragChatHandler(tenants)));

	// Execution operations
	router.post("/:uuid/-/chat", adapt(chatHandler(tenants)));
	router.post("/:uuid/-/answer", adapt(answerHandler(tenants)));

	return router;
}
