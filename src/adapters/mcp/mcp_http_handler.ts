import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Users } from "domain/users_groups/users.ts";
import {
	createJsonRpcErrorResponse,
	createJsonRpcParseErrorResponse,
	MCP_PROTOCOL_VERSION,
	processMcpRequest,
} from "./mcp_server.ts";

const BEARER_HEADER_REGEX = /^Bearer\s+(.+)$/i;

const JSON_RPC_ERROR = {
	INVALID_REQUEST: -32600,
	UNAUTHORIZED: -32001,
} as const;

type JsonRpcMessageKind = "request" | "notification" | "response" | "invalid";

interface JsonRpcEnvelope {
	jsonrpc: string;
	method?: unknown;
	id?: unknown;
	result?: unknown;
	error?: unknown;
}

function classifyJsonRpcMessage(payload: unknown): JsonRpcMessageKind {
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
		return "invalid";
	}

	const envelope = payload as JsonRpcEnvelope;
	if (envelope.jsonrpc !== "2.0") {
		return "invalid";
	}

	if (typeof envelope.method === "string" && envelope.method.length > 0) {
		if (!("id" in envelope)) {
			return "notification";
		}

		if (typeof envelope.id === "string" || typeof envelope.id === "number") {
			return "request";
		}

		return "invalid";
	}

	if (!("method" in envelope) && ("result" in envelope || "error" in envelope)) {
		if (
			typeof envelope.id === "string" ||
			typeof envelope.id === "number" ||
			envelope.id === null
		) {
			return "response";
		}
	}

	return "invalid";
}

function extractBearerToken(req: Request): string | undefined {
	const authorization = req.headers.get("authorization");
	if (!authorization) {
		return undefined;
	}

	const bearerMatch = authorization.match(BEARER_HEADER_REGEX);
	if (!bearerMatch?.[1]) {
		return undefined;
	}

	const token = bearerMatch[1].trim();
	return token.length > 0 ? token : undefined;
}

function hasUnsupportedQueryAuth(req: Request): boolean {
	try {
		const url = new URL(req.url);
		return url.searchParams.has("api_key");
	} catch {
		return false;
	}
}

function resolveRequestedTenantName(req: Request): string | undefined {
	const headerTenant = req.headers.get("x-tenant")?.trim();
	if (headerTenant) {
		return headerTenant;
	}

	try {
		const url = new URL(req.url);
		const queryTenant = url.searchParams.get("x-tenant")?.trim();
		return queryTenant && queryTenant.length > 0 ? queryTenant : undefined;
	} catch {
		return undefined;
	}
}

function resolveTenant(req: Request, tenants: AntboxTenant[]): AntboxTenant | undefined {
	const requestedTenant = resolveRequestedTenantName(req);
	if (!requestedTenant || requestedTenant === "default") {
		return tenants[0];
	}

	return tenants.find((tenant) => tenant.name === requestedTenant);
}

function buildApiKeyAuthContext(tenantName: string, group: string): AuthenticationContext {
	return {
		tenant: tenantName,
		mode: "Direct",
		principal: {
			email: Users.API_KEY_USER_EMAIL,
			groups: [group],
		},
	};
}

function buildJsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
		},
	});
}

function buildNoContentAcceptedResponse(): Response {
	return new Response(null, {
		status: 202,
	});
}

function ensureProtocolVersion(req: Request): Response | undefined {
	const versionHeader = req.headers.get("mcp-protocol-version");
	if (!versionHeader) {
		return undefined;
	}

	if (versionHeader !== MCP_PROTOCOL_VERSION) {
		return buildJsonResponse(
			400,
			createJsonRpcErrorResponse(
				null,
				JSON_RPC_ERROR.INVALID_REQUEST,
				`Unsupported MCP-Protocol-Version: ${versionHeader}`,
			),
		);
	}

	return undefined;
}

/**
 * Processes one HTTP request for the `/mcp` endpoint.
 *
 * Authentication profile:
 * - only `Authorization: Bearer <access_token>`
 * - bearer token is validated as an API key secret
 * - `X-Tenant` header or `?x-tenant=` query is optional (defaults to first tenant)
 */
export function mcpHttpHandler(
	tenants: AntboxTenant[],
): (req: Request) => Promise<Response> {
	return async (req: Request): Promise<Response> => {
		if (hasUnsupportedQueryAuth(req)) {
			return buildJsonResponse(
				401,
				createJsonRpcErrorResponse(
					null,
					JSON_RPC_ERROR.UNAUTHORIZED,
					"MCP does not accept query auth",
				),
			);
		}

		const tenant = resolveTenant(req, tenants);
		if (!tenant) {
			return buildJsonResponse(
				400,
				createJsonRpcErrorResponse(
					null,
					JSON_RPC_ERROR.INVALID_REQUEST,
					"Invalid tenant selection. Use X-Tenant header or x-tenant query parameter with the exact configured tenant name.",
				),
			);
		}

		const token = extractBearerToken(req);
		if (!token) {
			return buildJsonResponse(
				401,
				createJsonRpcErrorResponse(
					null,
					JSON_RPC_ERROR.UNAUTHORIZED,
					"MCP requires Authorization: Bearer <access_token>",
				),
			);
		}

		const apiKeyOrErr = await tenant.apiKeysService.getApiKeyBySecret(token);
		if (apiKeyOrErr.isLeft()) {
			return buildJsonResponse(
				401,
				createJsonRpcErrorResponse(
					null,
					JSON_RPC_ERROR.UNAUTHORIZED,
					"Invalid access token",
				),
			);
		}

		let payload: unknown;
		try {
			const rawBody = await req.text();
			payload = rawBody.length > 0 ? JSON.parse(rawBody) : null;
		} catch {
			return buildJsonResponse(400, createJsonRpcParseErrorResponse());
		}

		const protocolVersionError = ensureProtocolVersion(req);
		if (protocolVersionError) {
			return protocolVersionError;
		}

		const messageKind = classifyJsonRpcMessage(payload);
		if (messageKind === "invalid") {
			return buildJsonResponse(
				400,
				createJsonRpcErrorResponse(
					null,
					JSON_RPC_ERROR.INVALID_REQUEST,
					"Invalid JSON-RPC message",
				),
			);
		}

		if (messageKind === "response") {
			return buildNoContentAcceptedResponse();
		}

		const authContext = buildApiKeyAuthContext(tenant.name, apiKeyOrErr.value.group);
		const response = await processMcpRequest(payload, {
			tenant: tenant.name,
			authContext,
			nodeService: tenant.nodeService,
		});

		if (messageKind === "notification") {
			return buildNoContentAcceptedResponse();
		}

		if (!response) {
			return buildNoContentAcceptedResponse();
		}

		return buildJsonResponse(200, response);
	};
}
