import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import {
	DEFAULT_MCP_MAX_REQUEST_BODY_BYTES,
	type McpHttpOptions,
} from "api/http_server_configuration.ts";
import { Users } from "domain/users_groups/users.ts";
import {
	createJsonRpcErrorResponse,
	createJsonRpcParseErrorResponse,
	INVALID_REQUEST_METADATA_ERROR_CODE,
	type JsonRpcResponse,
	MCP_PROTOCOL_VERSION,
	processMcpRequest,
} from "./mcp_server.ts";

const BEARER_HEADER_REGEX = /^Bearer\s+(.+)$/i;

// -32000 sits in the JSON-RPC implementation-defined range reserved for transports.
const JSON_RPC_ERROR = {
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	HEADER_MISMATCH: -32020,
	UNSUPPORTED_PROTOCOL_VERSION: -32022,
	AUTHENTICATION_FAILED: -32000,
} as const;

const ACCEPT_MEDIA_TYPES = ["application/json", "text/event-stream"] as const;

// Exact, case-sensitive Base64 sentinel defined by the Streamable HTTP transport.
const BASE64_SENTINEL_REGEX = /^=\?base64\?(.*)\?=$/s;
const BASE64_PAYLOAD_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;
// RFC 9110 qvalue: "0" or "1" with an optional decimal point and up to three digits (only zeros after "1").
const QUALITY_REGEX = /^(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/;

type JsonRpcMessageKind = "request" | "notification" | "response" | "invalid";

interface JsonRpcEnvelope {
	jsonrpc: string;
	method?: unknown;
	id?: unknown;
	result?: unknown;
	error?: unknown;
}

interface McpBodyContext {
	method: string;
	protocolVersion: string;
	name?: string;
	uri?: string;
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

/**
 * Extracts the values mirrored into HTTP headers, requiring the modern per-request
 * metadata. Returns undefined when the body does not carry a valid request contract.
 */
function extractBodyContext(payload: unknown): McpBodyContext | undefined {
	if (typeof payload !== "object" || payload === null) {
		return undefined;
	}

	const envelope = payload as { method?: unknown; params?: unknown };
	if (typeof envelope.method !== "string" || envelope.method.length === 0) {
		return undefined;
	}

	if (typeof envelope.params !== "object" || envelope.params === null) {
		return undefined;
	}

	const params = envelope.params as Record<string, unknown>;
	const meta = params._meta;
	if (typeof meta !== "object" || meta === null) {
		return undefined;
	}

	const metaRecord = meta as Record<string, unknown>;
	const protocolVersion = metaRecord["io.modelcontextprotocol/protocolVersion"];
	const clientCapabilities = metaRecord["io.modelcontextprotocol/clientCapabilities"];
	if (typeof protocolVersion !== "string" || protocolVersion.length === 0) {
		return undefined;
	}

	if (
		typeof clientCapabilities !== "object" ||
		clientCapabilities === null ||
		Array.isArray(clientCapabilities)
	) {
		return undefined;
	}

	return {
		method: envelope.method,
		protocolVersion,
		name: typeof params.name === "string" ? params.name : undefined,
		uri: typeof params.uri === "string" ? params.uri : undefined,
	};
}

function requestIdOf(payload: unknown): string | number | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}

	const id = (payload as { id?: unknown }).id;
	return typeof id === "string" || typeof id === "number" ? id : null;
}

function decodeHeaderValue(value: string): string | undefined {
	const match = value.match(BASE64_SENTINEL_REGEX);
	if (!match) {
		return value;
	}

	const payload = match[1];
	if (!BASE64_PAYLOAD_REGEX.test(payload) || payload.length % 4 !== 0) {
		return undefined;
	}

	try {
		const binary = atob(payload);
		if (btoa(binary) !== payload) {
			return undefined;
		}
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return undefined;
	}
}

function parseQuality(parameters: string[]): number | undefined {
	let quality: number | undefined;

	for (const parameter of parameters) {
		const trimmed = parameter.trim();
		if (trimmed === "") {
			continue;
		}

		const separator = trimmed.indexOf("=");
		if (separator === -1) {
			continue;
		}

		const name = trimmed.slice(0, separator);
		if (name.toLowerCase() !== "q") {
			// A q-like name with stray whitespace is malformed, not another parameter.
			if (name.trim().toLowerCase() === "q") {
				return undefined;
			}
			continue;
		}

		if (quality !== undefined) {
			return undefined;
		}

		const value = trimmed.slice(separator + 1);
		if (!QUALITY_REGEX.test(value)) {
			return undefined;
		}
		quality = Number(value);
	}

	return quality ?? 1;
}

function hasRequiredAccept(req: Request): boolean {
	const accept = req.headers.get("accept");
	if (!accept) {
		return false;
	}

	const acceptable = new Set<string>();
	for (const part of accept.split(",")) {
		const segments = part.split(";");
		const mediaRange = segments[0].trim().toLowerCase();
		const quality = parseQuality(segments.slice(1));
		if (quality === undefined || quality <= 0) {
			continue;
		}
		acceptable.add(mediaRange);
	}

	return ACCEPT_MEDIA_TYPES.every((mediaType) => acceptable.has(mediaType));
}

function buildHeaderMismatchResponse(requestId: string | number | null, message: string): Response {
	return buildJsonResponse(
		400,
		createJsonRpcErrorResponse(
			requestId,
			JSON_RPC_ERROR.HEADER_MISMATCH,
			`Header mismatch: ${message}`,
		),
	);
}

function validateTransportHeaders(
	req: Request,
	body: McpBodyContext,
	requestId: string | number | null,
): Response | undefined {
	if (!hasRequiredAccept(req)) {
		return buildHeaderMismatchResponse(
			requestId,
			"Accept header must list acceptable application/json and text/event-stream ranges",
		);
	}

	const versionHeader = req.headers.get("mcp-protocol-version");
	if (!versionHeader) {
		return buildHeaderMismatchResponse(requestId, "missing MCP-Protocol-Version header");
	}

	if (versionHeader !== body.protocolVersion) {
		return buildHeaderMismatchResponse(
			requestId,
			`MCP-Protocol-Version header value '${versionHeader}' does not match body value '${body.protocolVersion}'`,
		);
	}

	if (versionHeader !== MCP_PROTOCOL_VERSION) {
		return buildJsonResponse(
			400,
			createJsonRpcErrorResponse(
				requestId,
				JSON_RPC_ERROR.UNSUPPORTED_PROTOCOL_VERSION,
				`Unsupported protocol version: ${versionHeader}`,
				{ supported: [MCP_PROTOCOL_VERSION], requested: versionHeader },
			),
		);
	}

	const methodHeader = req.headers.get("mcp-method");
	if (!methodHeader) {
		return buildHeaderMismatchResponse(requestId, "missing Mcp-Method header");
	}

	if (methodHeader !== body.method) {
		return buildHeaderMismatchResponse(
			requestId,
			`Mcp-Method header value '${methodHeader}' does not match body value '${body.method}'`,
		);
	}

	if (body.method !== "tools/call" && body.method !== "resources/read") {
		return undefined;
	}

	const nameHeader = req.headers.get("mcp-name");
	if (!nameHeader) {
		return buildHeaderMismatchResponse(requestId, `missing Mcp-Name header for ${body.method}`);
	}

	const decodedName = decodeHeaderValue(nameHeader);
	if (decodedName === undefined) {
		return buildHeaderMismatchResponse(
			requestId,
			`Mcp-Name header value '${nameHeader}' is not valid canonical Base64`,
		);
	}

	const expectedName = body.method === "tools/call" ? body.name : body.uri;
	if (expectedName === undefined) {
		return buildHeaderMismatchResponse(
			requestId,
			`${body.method} body does not carry the expected name`,
		);
	}

	if (decodedName !== expectedName) {
		return buildHeaderMismatchResponse(
			requestId,
			`Mcp-Name header value '${decodedName}' does not match body value '${expectedName}'`,
		);
	}

	return undefined;
}

function isInvalidRequestMetadata(response: JsonRpcResponse): boolean {
	const data = response.error?.data;
	return typeof data === "object" &&
		data !== null &&
		(data as { errorCode?: unknown }).errorCode === INVALID_REQUEST_METADATA_ERROR_CODE;
}

function statusForJsonRpcResponse(response: JsonRpcResponse): number {
	switch (response.error?.code) {
		case JSON_RPC_ERROR.METHOD_NOT_FOUND:
			return 404;
		case JSON_RPC_ERROR.HEADER_MISMATCH:
		case JSON_RPC_ERROR.UNSUPPORTED_PROTOCOL_VERSION:
			return 400;
		case JSON_RPC_ERROR.INVALID_PARAMS:
			// Metadata failures are transport-level 400s; tool/resource argument failures stay 200.
			return isInvalidRequestMetadata(response) ? 400 : 200;
		default:
			return 200;
	}
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
	if (!requestedTenant) return tenants[0];

	const namedTenant = tenants.find((tenant) => tenant.name === requestedTenant);
	if (namedTenant) return namedTenant;

	return requestedTenant === "default" ? tenants[0] : undefined;
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

function buildAnonymousAuthContext(tenantName: string): AuthenticationContext {
	return {
		tenant: tenantName,
		mode: "Direct",
		principal: {
			email: Users.ANONYMOUS_USER_EMAIL,
			groups: [],
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

function ensureAllowedOrigin(req: Request, allowedOrigins: string[]): Response | undefined {
	const origin = req.headers.get("origin");
	if (origin === null) {
		return undefined;
	}

	if (allowedOrigins.includes(origin)) {
		return undefined;
	}

	return buildJsonResponse(
		403,
		createJsonRpcErrorResponse(
			null,
			JSON_RPC_ERROR.INVALID_REQUEST,
			"Origin is not allowed",
		),
	);
}

async function readBodyWithinLimit(
	req: Request,
	maxRequestBodyBytes: number,
): Promise<string | undefined> {
	const contentLength = req.headers.get("content-length");
	if (contentLength !== null) {
		const declaredLength = Number(contentLength);
		if (Number.isFinite(declaredLength) && declaredLength > maxRequestBodyBytes) {
			return undefined;
		}
	}

	const body = req.body;
	if (!body) {
		return "";
	}

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			totalBytes += value.byteLength;
			if (totalBytes > maxRequestBodyBytes) {
				try {
					await reader.cancel();
				} catch {
					// Best effort: the overflow decision already stands.
				}
				return undefined;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return new TextDecoder().decode(bytes);
}

/**
 * Processes one HTTP request for the `/mcp` endpoint.
 *
 * Security order: Origin allowlist, query-auth rejection, tenant/bearer resolution,
 * request-size limit, JSON parsing, modern metadata and mirrored-header validation,
 * then dispatch.
 *
 * Authentication profile:
 * - `Authorization: Bearer <access_token>` enables full MCP access when valid
 * - invalid bearer tokens are rejected
 * - requests without a bearer token run in anonymous resource-only mode
 * - `X-Tenant` header or `?x-tenant=` query is optional (defaults to first tenant)
 */
export function mcpHttpHandler(
	tenants: AntboxTenant[],
	options: McpHttpOptions = {},
): (req: Request) => Promise<Response> {
	const allowedOrigins = options.allowedOrigins ?? [];
	const maxRequestBodyBytes = options.maxRequestBodyBytes ?? DEFAULT_MCP_MAX_REQUEST_BODY_BYTES;

	return async (req: Request): Promise<Response> => {
		const originResponse = ensureAllowedOrigin(req, allowedOrigins);
		if (originResponse) {
			return originResponse;
		}

		if (hasUnsupportedQueryAuth(req)) {
			return buildJsonResponse(
				401,
				createJsonRpcErrorResponse(
					null,
					JSON_RPC_ERROR.AUTHENTICATION_FAILED,
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
		let authContext = buildAnonymousAuthContext(tenant.name);
		let toolsEnabled = false;

		if (token) {
			const apiKeyOrErr = await tenant.apiKeysService.getApiKeyBySecret(token);
			if (apiKeyOrErr.isLeft()) {
				return buildJsonResponse(
					401,
					createJsonRpcErrorResponse(
						null,
						JSON_RPC_ERROR.AUTHENTICATION_FAILED,
						"Invalid access token",
					),
				);
			}

			authContext = buildApiKeyAuthContext(tenant.name, apiKeyOrErr.value.group);
			toolsEnabled = true;
		}

		let payload: unknown;
		try {
			const rawBody = await readBodyWithinLimit(req, maxRequestBodyBytes);
			if (rawBody === undefined) {
				return buildJsonResponse(
					413,
					createJsonRpcErrorResponse(
						null,
						JSON_RPC_ERROR.INVALID_REQUEST,
						"Request body exceeds the configured limit",
					),
				);
			}
			payload = rawBody.length > 0 ? JSON.parse(rawBody) : null;
		} catch {
			return buildJsonResponse(400, createJsonRpcParseErrorResponse());
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
			return buildJsonResponse(
				400,
				createJsonRpcErrorResponse(
					null,
					JSON_RPC_ERROR.INVALID_REQUEST,
					"JSON-RPC response envelopes are not accepted by the server",
				),
			);
		}

		const bodyContext = extractBodyContext(payload);
		const requestId = requestIdOf(payload);
		if (!bodyContext) {
			return buildJsonResponse(
				400,
				createJsonRpcErrorResponse(
					requestId,
					JSON_RPC_ERROR.INVALID_PARAMS,
					"Malformed or missing MCP request metadata",
				),
			);
		}

		const headerValidation = validateTransportHeaders(req, bodyContext, requestId);
		if (headerValidation) {
			return headerValidation;
		}

		const response = await processMcpRequest(payload, {
			tenant: tenant.name,
			authContext,
			toolsEnabled,
			nodeService: tenant.nodeService,
		});

		if (!response) {
			return buildNoContentAcceptedResponse();
		}

		return buildJsonResponse(statusForJsonRpcResponse(response), response);
	};
}
