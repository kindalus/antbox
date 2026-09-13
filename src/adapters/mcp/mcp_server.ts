import { DOCS, loadDoc } from "../../../docs/index.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { ForbiddenError, UnauthorizedError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import { APP_NAME, APP_VERSION } from "shared/app_metadata.ts";
import { ValidationError } from "shared/validation_error.ts";
import { z } from "zod";

const JSON_RPC_VERSION = "2.0";

const JSON_RPC_ERROR = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
	UNSUPPORTED_PROTOCOL_VERSION: -32022,
} as const;

export const MCP_PROTOCOL_VERSION = "2026-07-28";

/**
 * Machine-readable marker for `_meta` metadata failures. The transport maps these
 * `-32602` responses to HTTP 400, while tool/resource argument `-32602` errors keep
 * their JSON-only 200 semantics.
 */
export const INVALID_REQUEST_METADATA_ERROR_CODE = "InvalidRequestMetadata";

const SERVER_INFO = { name: APP_NAME, version: APP_VERSION } as const;

// MCP cache hints. Resource reads choose the scope by URI class, never by client input.
const DISCOVER_CACHE = { ttlMs: 0, cacheScope: "private" } as const;
const LIST_CACHE = { ttlMs: 300000, cacheScope: "private" } as const;
const DOC_READ_CACHE = { ttlMs: 300000, cacheScope: "public" } as const;
const NODE_READ_CACHE = { ttlMs: 0, cacheScope: "private" } as const;

const FILTER_OPERATORS = [
	"==",
	"<=",
	">=",
	"<",
	">",
	"!=",
	"in",
	"not-in",
	"match",
	"contains",
	"contains-all",
	"contains-any",
	"not-contains",
	"contains-none",
] as const;

const MCP_DOC_RESOURCE_UUIDS = new Set<string>([
	"llms",
	"webdav",
	"node-querying",
	"nodes-and-aspects",
	"overview",
	"features",
]);

const jsonRpcIdSchema = z.union([z.string(), z.number()]);

const jsonRpcRequestSchema = z.object({
	jsonrpc: z.literal(JSON_RPC_VERSION),
	id: jsonRpcIdSchema.optional(),
	method: z.string().min(1),
	params: z.unknown().optional(),
});

const LOGGING_LEVELS = [
	"debug",
	"info",
	"notice",
	"warning",
	"error",
	"critical",
	"alert",
	"emergency",
] as const;

// W3C Trace Context: version-traceId-spanId-flags, all lower-case hex.
const W3C_TRACEPARENT_REGEX = /^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/;

const requestMetaSchema = z.object({
	"io.modelcontextprotocol/protocolVersion": z.string().min(1),
	"io.modelcontextprotocol/clientCapabilities": z.record(z.string(), z.unknown()),
	"io.modelcontextprotocol/clientInfo": z.object({
		name: z.string().min(1),
		version: z.string().min(1),
	}).passthrough().optional(),
	"io.modelcontextprotocol/logLevel": z.enum(LOGGING_LEVELS).optional(),
	traceparent: z.string().regex(W3C_TRACEPARENT_REGEX).optional(),
	tracestate: z.string().optional(),
	baggage: z.string().optional(),
}).passthrough();

const requestParamsSchema = z.object({
	_meta: requestMetaSchema,
}).passthrough();

const nodeFilterSchema = z.tuple([
	z.string().min(1),
	z.enum(FILTER_OPERATORS),
	z.unknown(),
]);

const nodeFiltersSchema = z.union([
	z.string().min(1),
	z.array(nodeFilterSchema).min(1),
	z.array(z.array(nodeFilterSchema).min(1)).min(1),
]);

const toolsCallParamsSchema = z.object({
	name: z.string().min(1),
	arguments: z.record(z.string(), z.unknown()).optional(),
});

const resourcesReadParamsSchema = z.object({
	uri: z.string().min(1),
});

const toolGetNodeArgsSchema = z.object({
	uuid: z.string().min(1),
});

const toolFindNodesArgsSchema = z.object({
	filters: nodeFiltersSchema,
	pageSize: z.number().int().min(1).max(200).optional(),
	pageToken: z.number().int().min(1).optional(),
});

const toolListNodesArgsSchema = z.object({
	parent: z.string().min(1).optional(),
});

type JsonRpcRequestId = string | number;
type JsonRpcResponseId = JsonRpcRequestId | null;

export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: JsonRpcRequestId;
	method: string;
	params?: unknown;
}

interface JsonRpcError {
	code: number;
	message: string;
	data?: unknown;
}

export interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: JsonRpcResponseId;
	result?: unknown;
	error?: JsonRpcError;
}

interface McpTextContent {
	type: "text";
	text: string;
}

interface McpToolCallResult {
	content: McpTextContent[];
	isError?: boolean;
	structuredContent?: unknown;
}

interface McpToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	execute: (rawArgs: unknown, context: McpRequestContext) => Promise<McpToolCallResult>;
}

interface McpResource {
	uri: string;
	name: string;
	description: string;
	mimeType: string;
}

interface McpResourceTemplate {
	uriTemplate: string;
	name: string;
	description: string;
	mimeType: string;
}

export interface McpRequestContext {
	tenant: string;
	authContext: AuthenticationContext;
	toolsEnabled: boolean;
	nodeService: NodeService;
}

export function createJsonRpcErrorResponse(
	id: JsonRpcResponseId,
	code: number,
	message: string,
	data?: unknown,
): JsonRpcResponse {
	return {
		jsonrpc: JSON_RPC_VERSION,
		id,
		error: {
			code,
			message,
			...(data === undefined ? {} : { data }),
		},
	};
}

function createResultResponse(id: JsonRpcResponseId, result: object): JsonRpcResponse {
	return {
		jsonrpc: JSON_RPC_VERSION,
		id,
		result: {
			...result,
			resultType: "complete",
			_meta: {
				"io.modelcontextprotocol/serverInfo": SERVER_INFO,
			},
		},
	};
}

function normalizeError(error: unknown): { errorCode: string; message: string } {
	if (
		typeof error === "object" &&
		error !== null &&
		"errorCode" in error &&
		"message" in error
	) {
		const typedError = error as { errorCode: string; message: string };
		return {
			errorCode: typedError.errorCode,
			message: typedError.message,
		};
	}

	if (error instanceof Error) {
		return {
			errorCode: error.name || "Error",
			message: error.message,
		};
	}

	return {
		errorCode: "UnknownError",
		message: String(error),
	};
}

function mcpErrorFromAntboxError(error: unknown): JsonRpcError {
	const normalized = normalizeError(error);

	// Modern MCP removed the -32002/-32003/-32004 codes. Authorization failures on a
	// resource are indistinguishable from a missing resource to avoid leaking existence.
	if (
		normalized.errorCode === ValidationError.ERROR_CODE ||
		normalized.errorCode === UnauthorizedError.ERROR_CODE ||
		normalized.errorCode === ForbiddenError.ERROR_CODE ||
		normalized.errorCode.endsWith("NotFoundError") ||
		normalized.errorCode.endsWith("BadRequestError")
	) {
		return {
			code: JSON_RPC_ERROR.INVALID_PARAMS,
			message: normalized.message,
			data: normalized,
		};
	}

	return {
		code: JSON_RPC_ERROR.INTERNAL_ERROR,
		message: normalized.message,
		data: normalized,
	};
}

function toolSuccessResult(payload: unknown): McpToolCallResult {
	if (typeof payload === "string") {
		return {
			content: [{ type: "text", text: payload }],
		};
	}

	return {
		content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
		structuredContent: payload,
	};
}

function toolErrorResult(error: unknown): McpToolCallResult {
	const normalized = normalizeError(error);

	return {
		isError: true,
		content: [{
			type: "text",
			text: JSON.stringify(normalized, null, 2),
		}],
		structuredContent: normalized,
	};
}

async function readNodeResource(
	uuid: string,
	context: McpRequestContext,
): Promise<JsonRpcError | { uri: string; mimeType: string; text: string }> {
	const nodeOrErr = await context.nodeService.get(context.authContext, uuid);
	if (nodeOrErr.isLeft()) {
		return mcpErrorFromAntboxError(nodeOrErr.value);
	}

	return {
		uri: `antbox://nodes/${encodeURIComponent(uuid)}`,
		mimeType: "application/json",
		text: JSON.stringify(nodeOrErr.value, null, 2),
	};
}

async function readDocResource(
	docUuid: string,
): Promise<JsonRpcError | { uri: string; mimeType: string; text: string }> {
	if (!MCP_DOC_RESOURCE_UUIDS.has(docUuid)) {
		return {
			code: JSON_RPC_ERROR.INVALID_PARAMS,
			message: `Resource not found: antbox://docs/${docUuid}`,
			data: {
				errorCode: "ResourceNotFound",
				message: `Documentation '${docUuid}' is not exposed by MCP`,
			},
		};
	}

	const listedDoc = DOCS.find((doc) => doc.uuid === docUuid);
	if (!listedDoc) {
		return {
			code: JSON_RPC_ERROR.INVALID_PARAMS,
			message: `Resource not found: antbox://docs/${docUuid}`,
			data: {
				errorCode: "ResourceNotFound",
				message: `Documentation '${docUuid}' is not listed in docs/index.ts`,
			},
		};
	}

	const doc = await loadDoc(docUuid);
	if (!doc) {
		return {
			code: JSON_RPC_ERROR.INVALID_PARAMS,
			message: `Resource not found: antbox://docs/${docUuid}`,
			data: {
				errorCode: "ResourceNotFound",
				message: `Documentation '${docUuid}' not found`,
			},
		};
	}

	return {
		uri: `antbox://docs/${encodeURIComponent(docUuid)}`,
		mimeType: doc.mimetype,
		text: doc.content,
	};
}

function parseAntboxUri(uri: string): { kind: "doc" | "node"; id: string } | undefined {
	try {
		const parsed = new URL(uri);
		if (parsed.protocol !== "antbox:") {
			return undefined;
		}

		const id = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
		if (!id) {
			return undefined;
		}

		if (parsed.hostname === "docs") {
			return { kind: "doc", id };
		}

		if (parsed.hostname === "nodes") {
			return { kind: "node", id };
		}

		return undefined;
	} catch {
		return undefined;
	}
}

const mcpResourceTemplates: McpResourceTemplate[] = [
	{
		uriTemplate: "antbox://nodes/{uuid}",
		name: "node-by-uuid",
		description: "Read node metadata by UUID/FID with permission checks.",
		mimeType: "application/json",
	},
];

const mcpResources: McpResource[] = DOCS.filter((doc) => MCP_DOC_RESOURCE_UUIDS.has(doc.uuid)).map((
	doc,
) => ({
	uri: `antbox://docs/${encodeURIComponent(doc.uuid)}`,
	name: doc.uuid,
	description: doc.description,
	mimeType: "text/markdown",
}));

const mcpTools: McpToolDefinition[] = [
	{
		name: "nodes.get",
		description: "Get node metadata by UUID/FID with permission checks.",
		inputSchema: {
			type: "object",
			properties: {
				uuid: {
					type: "string",
					description: "Node UUID or FID token (--fid--...)",
				},
			},
			required: ["uuid"],
			additionalProperties: false,
		},
		execute: async (rawArgs, context) => {
			const parsed = toolGetNodeArgsSchema.safeParse(rawArgs);
			if (!parsed.success) {
				return toolErrorResult({
					errorCode: "InvalidToolArguments",
					message: `Invalid nodes.get arguments: ${parsed.error.message}`,
				});
			}

			const nodeOrErr = await context.nodeService.get(context.authContext, parsed.data.uuid);
			if (nodeOrErr.isLeft()) {
				return toolErrorResult(nodeOrErr.value);
			}

			return toolSuccessResult(nodeOrErr.value);
		},
	},
	{
		name: "nodes.find",
		description: "Search nodes using structured filters or text query.",
		inputSchema: {
			type: "object",
			properties: {
				filters: {
					description: "Node filters or text query (supports semantic prefix '?')",
					anyOf: [
						{ type: "string" },
						{
							type: "array",
							items: {},
						},
					],
				},
				pageSize: {
					type: "integer",
					minimum: 1,
					maximum: 200,
				},
				pageToken: {
					type: "integer",
					minimum: 1,
				},
			},
			required: ["filters"],
			additionalProperties: false,
		},
		execute: async (rawArgs, context) => {
			const parsed = toolFindNodesArgsSchema.safeParse(rawArgs);
			if (!parsed.success) {
				return toolErrorResult({
					errorCode: "InvalidToolArguments",
					message: `Invalid nodes.find arguments: ${parsed.error.message}`,
				});
			}

			const resultOrErr = await context.nodeService.find(
				context.authContext,
				parsed.data.filters,
				parsed.data.pageSize,
				parsed.data.pageToken,
			);
			if (resultOrErr.isLeft()) {
				return toolErrorResult(resultOrErr.value);
			}

			return toolSuccessResult({
				pageToken: resultOrErr.value.pageToken,
				pageSize: resultOrErr.value.pageSize,
				scores: resultOrErr.value.scores,
				nodes: resultOrErr.value.nodes.map((node) => node.metadata),
			});
		},
	},
	{
		name: "nodes.list",
		description: "List nodes under a parent folder (defaults to root).",
		inputSchema: {
			type: "object",
			properties: {
				parent: {
					type: "string",
					description: "Parent folder UUID/FID. Defaults to root.",
				},
			},
			additionalProperties: false,
		},
		execute: async (rawArgs, context) => {
			const parsed = toolListNodesArgsSchema.safeParse(rawArgs);
			if (!parsed.success) {
				return toolErrorResult({
					errorCode: "InvalidToolArguments",
					message: `Invalid nodes.list arguments: ${parsed.error.message}`,
				});
			}

			const listOrErr = await context.nodeService.list(context.authContext, parsed.data.parent);
			if (listOrErr.isLeft()) {
				return toolErrorResult(listOrErr.value);
			}

			return toolSuccessResult({
				nodes: listOrErr.value,
			});
		},
	},
];

const mcpToolsByName = new Map(mcpTools.map((tool) => [tool.name, tool]));

/**
 * Parses and processes one MCP JSON-RPC request.
 */
export async function processMcpRequest(
	rawRequest: unknown,
	context: McpRequestContext,
): Promise<JsonRpcResponse | null> {
	if (Array.isArray(rawRequest)) {
		return createJsonRpcErrorResponse(
			null,
			JSON_RPC_ERROR.INVALID_REQUEST,
			"Batch requests are not supported",
		);
	}

	const parsedRequest = jsonRpcRequestSchema.safeParse(rawRequest);
	if (!parsedRequest.success) {
		return createJsonRpcErrorResponse(
			null,
			JSON_RPC_ERROR.INVALID_REQUEST,
			"Invalid JSON-RPC request",
			parsedRequest.error.flatten(),
		);
	}

	const request = parsedRequest.data;
	const requestId = request.id ?? null;
	const start = Date.now();
	let status = "ok";

	try {
		const requestParams = requestParamsSchema.safeParse(request.params ?? {});
		if (!requestParams.success) {
			status = "invalid_metadata";
			return createJsonRpcErrorResponse(
				requestId,
				JSON_RPC_ERROR.INVALID_PARAMS,
				"Invalid MCP request metadata",
				{ errorCode: INVALID_REQUEST_METADATA_ERROR_CODE, ...requestParams.error.flatten() },
			);
		}

		const requestedVersion = requestParams.data._meta[
			"io.modelcontextprotocol/protocolVersion"
		];
		if (requestedVersion !== MCP_PROTOCOL_VERSION) {
			status = "unsupported_protocol_version";
			return createJsonRpcErrorResponse(
				requestId,
				JSON_RPC_ERROR.UNSUPPORTED_PROTOCOL_VERSION,
				`Unsupported protocol version: ${requestedVersion}`,
				{ supported: [MCP_PROTOCOL_VERSION], requested: requestedVersion },
			);
		}

		// The approved surface accepts no notifications; id-less messages are still
		// validated above, then rejected rather than silently accepted.
		if (request.id === undefined) {
			status = "notification_not_supported";
			return createJsonRpcErrorResponse(
				requestId,
				JSON_RPC_ERROR.METHOD_NOT_FOUND,
				`Method not found: ${request.method}`,
			);
		}

		switch (request.method) {
			case "server/discover":
				return createResultResponse(requestId, {
					supportedVersions: [MCP_PROTOCOL_VERSION],
					capabilities: {
						...(context.toolsEnabled ? { tools: {} } : {}),
						resources: {},
					},
					instructions: context.toolsEnabled
						? "Use Authorization: Bearer <access_token> on every request for tools and resources. X-Tenant is optional."
						: "Authorization: Bearer <access_token> is optional. Without it, MCP exposes resources only and does not expose tools. X-Tenant is optional.",
					...DISCOVER_CACHE,
				});

			case "tools/list":
				if (!context.toolsEnabled) {
					status = "method_not_found";
					return createJsonRpcErrorResponse(
						requestId,
						JSON_RPC_ERROR.METHOD_NOT_FOUND,
						"Method not found: tools/list",
					);
				}

				return createResultResponse(requestId, {
					tools: mcpTools.map((tool) => ({
						name: tool.name,
						description: tool.description,
						inputSchema: tool.inputSchema,
					})),
					...LIST_CACHE,
				});

			case "tools/call": {
				if (!context.toolsEnabled) {
					status = "method_not_found";
					return createJsonRpcErrorResponse(
						requestId,
						JSON_RPC_ERROR.METHOD_NOT_FOUND,
						"Method not found: tools/call",
					);
				}
				const params = toolsCallParamsSchema.safeParse(request.params ?? {});
				if (!params.success) {
					return createJsonRpcErrorResponse(
						requestId,
						JSON_RPC_ERROR.INVALID_PARAMS,
						"Invalid tools/call params",
						params.error.flatten(),
					);
				}

				const tool = mcpToolsByName.get(params.data.name);
				if (!tool) {
					return createJsonRpcErrorResponse(
						requestId,
						JSON_RPC_ERROR.INVALID_PARAMS,
						`Invalid params: unknown tool '${params.data.name}'`,
						{
							errorCode: "ToolNotFound",
							message: `Tool '${params.data.name}' not found`,
						},
					);
				}

				const toolResult = await tool.execute(params.data.arguments ?? {}, context);
				return createResultResponse(requestId, toolResult);
			}

			case "resources/list":
				return createResultResponse(requestId, {
					resources: mcpResources,
					...LIST_CACHE,
				});

			case "resources/templates/list":
				return createResultResponse(requestId, {
					resourceTemplates: mcpResourceTemplates,
					...LIST_CACHE,
				});

			case "resources/read": {
				const params = resourcesReadParamsSchema.safeParse(request.params ?? {});
				if (!params.success) {
					return createJsonRpcErrorResponse(
						requestId,
						JSON_RPC_ERROR.INVALID_PARAMS,
						"Invalid resources/read params",
						params.error.flatten(),
					);
				}

				const parsedUri = parseAntboxUri(params.data.uri);
				if (!parsedUri) {
					return createJsonRpcErrorResponse(
						requestId,
						JSON_RPC_ERROR.INVALID_PARAMS,
						`Unsupported resource URI: ${params.data.uri}`,
					);
				}

				const contentOrErr = parsedUri.kind === "doc"
					? await readDocResource(parsedUri.id)
					: await readNodeResource(parsedUri.id, context);

				if ("code" in contentOrErr) {
					return createJsonRpcErrorResponse(
						requestId,
						contentOrErr.code,
						contentOrErr.message,
						contentOrErr.data,
					);
				}

				return createResultResponse(requestId, {
					contents: [contentOrErr],
					...(parsedUri.kind === "doc" ? DOC_READ_CACHE : NODE_READ_CACHE),
				});
			}

			default:
				status = "method_not_found";
				return createJsonRpcErrorResponse(
					requestId,
					JSON_RPC_ERROR.METHOD_NOT_FOUND,
					`Method not found: ${request.method}`,
				);
		}
	} catch (error) {
		status = "internal_error";
		const normalized = normalizeError(error);
		return createJsonRpcErrorResponse(
			requestId,
			JSON_RPC_ERROR.INTERNAL_ERROR,
			normalized.message,
			normalized,
		);
	} finally {
		const elapsedMs = Date.now() - start;
		Logger.debug("mcp.request", {
			tenant: context.tenant,
			principal: context.authContext.principal.email,
			method: request.method,
			status,
			elapsedMs,
		});
	}
}

export function createJsonRpcParseErrorResponse(): JsonRpcResponse {
	return createJsonRpcErrorResponse(null, JSON_RPC_ERROR.PARSE_ERROR, "Parse error");
}
