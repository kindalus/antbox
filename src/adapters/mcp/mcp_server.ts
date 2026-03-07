import { DOCS, loadDoc } from "../../../docs/index.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { ForbiddenError, UnauthorizedError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import { ValidationError } from "shared/validation_error.ts";
import { z } from "zod";

const JSON_RPC_VERSION = "2.0";

const JSON_RPC_ERROR = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
	UNAUTHORIZED: -32001,
	FORBIDDEN: -32003,
	NOT_FOUND: -32004,
} as const;

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
]);

const jsonRpcIdSchema = z.union([z.string(), z.number()]);

const jsonRpcRequestSchema = z.object({
	jsonrpc: z.literal(JSON_RPC_VERSION),
	id: jsonRpcIdSchema.optional(),
	method: z.string().min(1),
	params: z.unknown().optional(),
});

const initializeParamsSchema = z.object({
	protocolVersion: z.string().optional(),
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
	nodeService: NodeService;
}

export const MCP_PROTOCOL_VERSION = "2025-11-25";

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

function createJsonRpcResultResponse(id: JsonRpcResponseId, result: unknown): JsonRpcResponse {
	return {
		jsonrpc: JSON_RPC_VERSION,
		id,
		result,
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

	if (normalized.errorCode === ValidationError.ERROR_CODE) {
		return {
			code: JSON_RPC_ERROR.INVALID_PARAMS,
			message: normalized.message,
			data: normalized,
		};
	}

	if (normalized.errorCode === UnauthorizedError.ERROR_CODE) {
		return {
			code: JSON_RPC_ERROR.UNAUTHORIZED,
			message: normalized.message,
			data: normalized,
		};
	}

	if (normalized.errorCode === ForbiddenError.ERROR_CODE) {
		return {
			code: JSON_RPC_ERROR.FORBIDDEN,
			message: normalized.message,
			data: normalized,
		};
	}

	if (normalized.errorCode.endsWith("NotFoundError")) {
		return {
			code: JSON_RPC_ERROR.NOT_FOUND,
			message: normalized.message,
			data: normalized,
		};
	}

	if (normalized.errorCode.endsWith("BadRequestError")) {
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
			code: JSON_RPC_ERROR.NOT_FOUND,
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
			code: JSON_RPC_ERROR.NOT_FOUND,
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
			code: JSON_RPC_ERROR.NOT_FOUND,
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
		switch (request.method) {
			case "initialize": {
				const params = initializeParamsSchema.safeParse(request.params ?? {});
				if (!params.success) {
					return createJsonRpcErrorResponse(
						requestId,
						JSON_RPC_ERROR.INVALID_PARAMS,
						"Invalid initialize params",
						params.error.flatten(),
					);
				}

				return createJsonRpcResultResponse(requestId, {
					protocolVersion: MCP_PROTOCOL_VERSION,
					capabilities: {
						tools: {
							listChanged: false,
						},
						resources: {
							listChanged: false,
							subscribe: false,
						},
					},
					serverInfo: {
						name: "antbox",
						version: "0.1.0",
					},
					instructions:
						"Use Authorization: Bearer <access_token> on every request. X-Tenant is optional.",
				});
			}

			case "notifications/initialized":
				return null;

			case "ping":
				return createJsonRpcResultResponse(requestId, {});

			case "tools/list":
				return createJsonRpcResultResponse(requestId, {
					tools: mcpTools.map((tool) => ({
						name: tool.name,
						description: tool.description,
						inputSchema: tool.inputSchema,
					})),
				});

			case "tools/call": {
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
					return createJsonRpcResultResponse(
						requestId,
						toolErrorResult({
							errorCode: "ToolNotFound",
							message: `Tool '${params.data.name}' not found`,
						}),
					);
				}

				const toolResult = await tool.execute(params.data.arguments ?? {}, context);
				return createJsonRpcResultResponse(requestId, toolResult);
			}

			case "resources/list":
				return createJsonRpcResultResponse(requestId, {
					resources: mcpResources,
				});

			case "resources/templates/list":
				return createJsonRpcResultResponse(requestId, {
					resourceTemplates: mcpResourceTemplates,
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

				return createJsonRpcResultResponse(requestId, {
					contents: [contentOrErr],
				});
			}

			default:
				if (request.id === undefined) {
					return null;
				}

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
