import { z } from "zod";
import { Groups } from "domain/users_groups/groups.ts";
import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getTenant } from "./get_tenant.ts";
import {
	type HttpHandler,
	sendAccepted,
	sendBadRequest,
	sendForbidden,
	sendOK,
} from "./handler.ts";
import { processError } from "./process_error.ts";

const ReindexRequestSchema = z.object({
	mode: z.enum(["missing", "all"]).default("missing"),
});

function isAdmin(req: Request): boolean {
	return getAuthenticationContext(req).principal.groups.includes(Groups.ADMINS_GROUP_UUID);
}

/** POST /nodes/-/embeddings/reindex — queues the tenant's nodes for semantic indexing. */
export function reindexEmbeddingsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			if (!isAdmin(req)) return sendForbidden();

			const tenant = getTenant(req, tenants);
			if (!tenant.ragService) {
				return sendBadRequest({
					errorCode: "BadRequestError",
					message: "Semantic search is not enabled for this tenant",
				});
			}

			let body: unknown = {};
			const text = await req.text();
			if (text.trim()) {
				try {
					body = JSON.parse(text);
				} catch {
					return sendBadRequest({
						errorCode: "BadRequestError",
						message: "Invalid JSON body",
					});
				}
			}

			const parsed = ReindexRequestSchema.safeParse(body);
			if (!parsed.success) {
				return sendBadRequest({
					errorCode: "BadRequestError",
					message: parsed.error.issues.map((issue) => issue.message).join("; "),
				});
			}

			const result = await tenant.ragService.reindex({
				mode: parsed.data.mode,
				tenant: tenant.name,
				actor: getAuthenticationContext(req).principal.email,
			});
			return result.isLeft() ? processError(result.value) : sendAccepted(result.value);
		},
	);
}

/** GET /nodes/-/embeddings/status — indexing counts, the last reindex job and recent failures. */
export function getEmbeddingsStatusHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			if (!isAdmin(req)) return sendForbidden();

			const tenant = getTenant(req, tenants);
			if (!tenant.ragService) return sendOK({ enabled: false });

			const result = await tenant.ragService.status();
			return result.isLeft() ? processError(result.value) : sendOK(result.value);
		},
	);
}
