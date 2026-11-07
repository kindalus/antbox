import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { type TSchema, Type } from "@earendil-works/pi-ai";
import { type Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import {
	type FeatureData,
	type FeatureParameter,
	isReservedAIToolName,
	toSnakeCase,
} from "domain/configuration/feature_data.ts";
import { Logger } from "shared/logger.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeService } from "../nodes/node_service.ts";
import type { AspectsService } from "../aspects/aspects_service.ts";
import type { FeaturesService } from "../features/features_service.ts";
import { NodeServiceProxy } from "../nodes/node_service_proxy.ts";
import { AspectServiceProxy } from "../aspects/aspect_service_proxy.ts";
import { createRunCodeTool, RUN_CODE_DESCRIPTION } from "./builtin_tools/run_code.ts";
import type { LoadedSkill } from "./skills_loader.ts";
import { createSkillReadTool, SKILL_READ_TOOL_NAME } from "./skill_read_tool.ts";
import type { FeatureAIToolExecutor } from "./agents_engine_interface.ts";
import type { FeatureVersion } from "./session_workspace.ts";

const DEFAULT_TOOL_NAME = SKILL_READ_TOOL_NAME;
const LEGACY_SKILL_TOOL_NAME = "load_skill";

type AnyAgentTool = AgentTool<TSchema, unknown>;

/**
 * Parse a `filters` argument from `find_nodes`. Provider function schemas cannot
 * reliably represent the original string/tuple unions, so structured filters use JSON.
 */
function parseFindFilters(input: string): NodeFilters | string {
	const trimmed = input.trim();
	if (!(trimmed.startsWith("[") && trimmed.endsWith("]"))) return input;
	try {
		const parsed = JSON.parse(trimmed);
		return Array.isArray(parsed) && parsed.length > 0 ? parsed as NodeFilters : input;
	} catch {
		return input;
	}
}

/**
 * `find_documents` filters arrive as structured arrays, or JSON strings from models that encode
 * nested arrays. Anything else is passed through so the service rejects it with a clear message.
 */
function parseDocumentFilters(input: unknown): NodeFilters | undefined {
	if (input === undefined || input === null) return undefined;
	if (typeof input !== "string") return input as NodeFilters;
	try {
		return JSON.parse(input) as NodeFilters;
	} catch {
		throw new Error("filters must be an array of [field, operator, value] tuples or its JSON");
	}
}

export const FIND_DOCUMENTS_DESCRIPTION = [
	"Find documents and read their text in one call. Read-only; returns only nodes you can read.",
	"Give filters, a query, or both:",
	"filters alone lists the nodes that match them and returns the exact total (use it for status, dates, amounts, people, 'how many', 'which', 'list');",
	"query alone ranks nodes by meaning (semantic search, full-text when unavailable);",
	"filters plus query ranks by meaning only among the nodes that match the filters.",
	'Filters are [field, operator, value] tuples, 1D = AND, 2D = OR. Operators: == != < <= > >= in not-in match contains contains-all contains-any not-contains contains-none. Aspect properties are "aspectUuid:propertyName" (e.g. ["invoice:status","==","Open"]) and need ["aspects","contains","aspectUuid"]; use the exact validationList values. "match" is for text fields; contains operators apply only to arrays such as tags and aspects. A field starting with "@" filters on the parent folder (e.g. ["@title","==","Invoices"]).',
	'Result: { mode: "filters" | "semantic" | "fulltext", total, totalIsLowerBound?, returned, notice?, nodes: [{ uuid, title, mimetype, parent, description?, tags?, aspects?, properties?, score?, content?, contentTruncated? }] }.',
	"total is exact only in filters mode; in semantic and fulltext modes it counts the relevant results within the first 50.",
	"content is the node's stored text (without metadata), truncated to max_chars_per_node.",
].join(" ");

export interface BuildToolSetContext {
	readonly nodeService: NodeService;
	readonly aspectsService: AspectsService;
	readonly featuresService: FeaturesService;
	readonly skills: LoadedSkill[];
	readonly featureAIToolExecutor?: FeatureAIToolExecutor;
}

export interface BuiltToolSet {
	readonly tools: AnyAgentTool[];
	readonly toolNames: string[];
	readonly featureVersions: FeatureVersion[];
}

export async function buildToolSet(
	ctx: BuildToolSetContext,
	agentData: AgentData,
	authContext: AuthenticationContext,
	sealedToolNames?: readonly string[],
): Promise<Either<AntboxError, BuiltToolSet>> {
	const allEntries = await buildAllToolEntries(ctx, agentData, authContext);
	if (allEntries.isLeft()) return left(allEntries.value);

	const selected = sealedToolNames
		? selectSealedEntries(allEntries.value, sealedToolNames)
		: selectEntries(allEntries.value, agentData.tools);
	if (selected instanceof AntboxError) return left(selected);
	return right({
		tools: selected.map((entry) => entry.tool),
		toolNames: selected.map((entry) => entry.name),
		featureVersions: selected.flatMap((entry) =>
			entry.featureVersion ? [entry.featureVersion] : []
		),
	});
}

interface ToolEntry {
	readonly name: string;
	readonly aliases: readonly string[];
	readonly tool: AnyAgentTool;
	readonly featureVersion?: FeatureVersion;
}

function selectSealedEntries(
	all: ToolEntry[],
	names: readonly string[],
): ToolEntry[] | AntboxError {
	const byName = new Map(all.map((entry) => [entry.name, entry]));
	const selected: ToolEntry[] = [];
	for (const sealedName of names) {
		const name = sealedName === LEGACY_SKILL_TOOL_NAME ? DEFAULT_TOOL_NAME : sealedName;
		const entry = byName.get(name);
		if (!entry) return new AntboxError("StaleSession", `Session tool '${name}' is unavailable`);
		selected.push(entry);
	}
	return selected;
}

function selectEntries(all: ToolEntry[], tools: AgentData["tools"]): ToolEntry[] {
	if (tools === true) return all;
	const isDefault = (entry: ToolEntry) => entry.name === DEFAULT_TOOL_NAME;
	if (tools === false || tools === undefined || tools.length === 0) return all.filter(isDefault);

	const allowed = new Set(tools);
	return all.filter((entry) =>
		isDefault(entry) || allowed.has(entry.name) ||
		entry.aliases.some((alias) => allowed.has(alias))
	);
}

async function buildAllToolEntries(
	ctx: BuildToolSetContext,
	agentData: AgentData,
	authContext: AuthenticationContext,
): Promise<Either<AntboxError, ToolEntry[]>> {
	const nodeProxy = new NodeServiceProxy(ctx.nodeService, authContext);
	const aspectProxy = new AspectServiceProxy(ctx.aspectsService, authContext);
	const runCode = createRunCodeTool(nodeProxy, aspectProxy, {});

	const builtIn: ToolEntry[] = [
		{
			name: "run_code",
			aliases: [],
			tool: {
				name: "run_code",
				label: "Run code",
				description: RUN_CODE_DESCRIPTION,
				parameters: Type.Object({
					code: Type.String({
						minLength: 1,
						description:
							"ESM JavaScript/TypeScript module code with a default export function",
					}),
				}),
				executionMode: "sequential",
				execute: async (_id, params) => {
					const { code } = params as { code: string };
					return textToolResult(await runCode(code));
				},
			},
		},
		{
			name: "find_nodes",
			aliases: [],
			tool: {
				name: "find_nodes",
				label: "Find nodes",
				description:
					'Find nodes. filters is either a JSON-encoded array of [field, operator, value] tuples (1D = AND, 2D = OR; e.g. \'[["title","match","policy"],["tags","contains","urgent"]]\') or a string: "?text" runs a semantic search, filter notation such as "inv-uuid:status == open, size > 1000" is parsed as filters, and any other text runs a full-text search. In notation, == / != / in values and booleans stay text (so "inv-uuid:amount == 100" or "inv-uuid:paid == true" match nothing); use the JSON array form for typed values. Use "match" for text fields; the contains operators apply only to arrays such as tags and aspects (a non-array value never contains anything, so ["title","contains",…] matches no node). Aspect properties are keyed "aspectUuid:propertyName"; a field starting with "@" filters on the parent folder (e.g. ["@title","==","Invoices"]), here and in aspect, folder, feature and workflow filters. To list aspect definitions, use run_code with its aspects SDK. Returns metadata pages without text or a total; find_documents, when available, returns both.',
				parameters: Type.Object({
					filters: Type.String({
						minLength: 1,
						description: "Plain-text search string, or a JSON-encoded array of filter tuples",
					}),
					page_size: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
					page_token: Type.Optional(Type.Integer({ minimum: 1 })),
				}),
				execute: async (_id, params) => {
					const { filters, page_size, page_token } = params as {
						filters: string;
						page_size?: number;
						page_token?: number;
					};
					const result = await nodeProxy.find(
						parseFindFilters(filters),
						page_size,
						page_token,
					);
					if (result.isLeft()) throw new Error(result.value.message);
					return jsonToolResult(result.value);
				},
			},
		},
		{
			name: "get_node",
			aliases: [],
			tool: {
				name: "get_node",
				label: "Get node",
				description: "Get a single node by UUID.",
				parameters: Type.Object({ uuid: Type.String({ minLength: 1 }) }),
				execute: async (_id, params) => {
					const { uuid } = params as { uuid: string };
					const result = await nodeProxy.get(uuid);
					if (result.isLeft()) throw new Error(result.value.message);
					return jsonToolResult(result.value);
				},
			},
		},
		{
			name: "semantic_search",
			aliases: [],
			tool: {
				name: "semantic_search",
				label: "Semantic search",
				description:
					"Run semantic search over indexed node content: the top 10 readable nodes closest in meaning, with their text. It cannot filter by attributes or count; when find_documents is available, use it for that.",
				parameters: Type.Object({ query: Type.String({ minLength: 1 }) }),
				execute: async (_id, params) => {
					const { query } = params as { query: string };
					const result = await nodeProxy.semanticQuery(query);
					if (result.isLeft()) {
						throw new Error(
							result.value instanceof Error ? result.value.message : String(result.value),
						);
					}
					const value = Array.isArray(result.value) ? { results: result.value } : result.value;
					return jsonToolResult(value);
				},
			},
		},
		{
			name: "find_documents",
			aliases: [],
			tool: {
				name: "find_documents",
				label: "Find documents",
				description: FIND_DOCUMENTS_DESCRIPTION,
				parameters: Type.Object({
					filters: Type.Optional(
						Type.Union([
							Type.Array(Type.Array(Type.Any()), {
								description:
									'Node filters: [field, operator, value] tuples (1D = AND) or a list of such lists (2D = OR), e.g. [["aspects","contains","invoice"],["invoice:status","!=","Closed"]]',
							}),
							Type.String({
								minLength: 1,
								description: "The same filters as a JSON-encoded array",
							}),
						]),
					),
					query: Type.Optional(
						Type.String({
							minLength: 1,
							description: "Natural-language text to rank the matching nodes by meaning",
						}),
					),
					limit: Type.Optional(
						Type.Integer({ minimum: 1, description: "Nodes to return, default 10, max 20" }),
					),
					include_content: Type.Optional(
						Type.Boolean({ description: "Return each node's stored text, default true" }),
					),
					max_chars_per_node: Type.Optional(
						Type.Integer({
							minimum: 1,
							description: "Characters of text per node, default 4000, max 8000",
						}),
					),
				}),
				execute: async (_id, params) => {
					const { filters, query, limit, include_content, max_chars_per_node } = params as {
						filters?: unknown;
						query?: string;
						limit?: number;
						include_content?: boolean;
						max_chars_per_node?: number;
					};
					const result = await nodeProxy.findDocuments({
						filters: parseDocumentFilters(filters),
						query,
						limit,
						includeContent: include_content,
						maxCharsPerNode: max_chars_per_node,
					});
					if (result.isLeft()) throw new Error(result.value.message);
					return jsonToolResult(result.value);
				},
			},
		},
		{
			name: DEFAULT_TOOL_NAME,
			aliases: [],
			tool: await createSkillReadTool(
				ctx.skills.filter((skill) => isSkillAllowed(agentData.skills, skill)),
			),
		},
	];

	const featureToolsOrErr = await buildFeatureAITools(ctx, authContext);
	if (featureToolsOrErr.isLeft()) return left(featureToolsOrErr.value);
	const all = [...builtIn, ...featureToolsOrErr.value];
	assertUniqueAliases(all);
	return right(all);
}

function isSkillAllowed(
	allowList: readonly string[] | undefined,
	skill: LoadedSkill,
): boolean {
	return !allowList || allowList.length === 0 || allowList.includes(skill.frontmatter.name);
}

async function buildFeatureAITools(
	ctx: BuildToolSetContext,
	authContext: AuthenticationContext,
): Promise<Either<AntboxError, ToolEntry[]>> {
	const aiToolsOrErr = await ctx.featuresService.listAITools(authContext);
	if (aiToolsOrErr.isLeft()) return left(aiToolsOrErr.value);
	// Built-in tools always win: a feature colliding with one is dropped for every agent.
	const features = aiToolsOrErr.value.filter((feature) => {
		if (!isReservedAIToolName(feature.uuid)) return true;
		Logger.warn(
			`build_tools: ignoring feature '${feature.uuid}' as AI tool, name '${
				toSnakeCase(feature.uuid)
			}' is reserved for a built-in tool`,
		);
		return false;
	});
	return right(features.map((feature) => featureToToolEntry(ctx, authContext, feature)));
}

function featureToToolEntry(
	ctx: BuildToolSetContext,
	authContext: AuthenticationContext,
	feature: FeatureData,
): ToolEntry {
	const toolName = toSnakeCase(feature.uuid);
	const aliases = toolName === feature.uuid ? [] : [feature.uuid];
	const aliasEntries = featureParameterAliases(feature.parameters);
	return {
		name: toolName,
		aliases,
		featureVersion: { uuid: feature.uuid, modifiedTime: feature.modifiedTime },
		tool: {
			name: toolName,
			label: feature.title || feature.uuid,
			description: feature.description,
			parameters: featureParametersToSchema(aliasEntries),
			executionMode: "sequential",
			execute: async (_id, params) => {
				if (!ctx.featureAIToolExecutor) {
					throw new Error("Feature AI tool executor not available");
				}
				const mapped = mapFeatureParameters(aliasEntries, params as Record<string, unknown>);
				const result = await ctx.featureAIToolExecutor.runAITool(
					authContext,
					feature.uuid,
					mapped,
				);
				if (result.isLeft()) throw new Error(result.value.message);
				const value = Array.isArray(result.value) ? { results: result.value } : result.value;
				return jsonToolResult(value);
			},
		},
	};
}

function featureParameterAliases(parameters: FeatureParameter[]) {
	const aliases = parameters.map((parameter) => ({
		parameter,
		exposedName: toSnakeCase(parameter.name),
	}));
	const seen = new Set<string>();
	for (const entry of aliases) {
		if (seen.has(entry.exposedName)) {
			throw new AntboxError(
				"FeatureParameterAliasCollision",
				`Feature parameter alias collision for '${entry.exposedName}' on parameter '${entry.parameter.name}'`,
			);
		}
		seen.add(entry.exposedName);
	}
	return aliases;
}

function mapFeatureParameters(
	aliases: Array<{ parameter: FeatureParameter; exposedName: string }>,
	params: Record<string, unknown>,
): Record<string, unknown> {
	const mapped: Record<string, unknown> = {};
	for (const alias of aliases) {
		if (alias.exposedName in params) mapped[alias.parameter.name] = params[alias.exposedName];
	}
	return mapped;
}

function featureParametersToSchema(
	aliases: Array<{ parameter: FeatureParameter; exposedName: string }>,
): TSchema {
	const properties: Record<string, TSchema> = {};
	for (const { parameter, exposedName } of aliases) {
		const description = parameter.description ?? parameter.name;
		let schema = featureParameterSchema(parameter, description);
		if (!parameter.required) schema = Type.Optional(schema);
		properties[exposedName] = schema;
	}
	return Type.Object(properties);
}

function featureParameterSchema(parameter: FeatureParameter, description: string): TSchema {
	switch (parameter.type) {
		case "string":
			return Type.String({ description });
		case "date":
			return Type.String({ description: `${description} (ISO-8601 date string)` });
		case "number":
			return Type.Number({ description });
		case "boolean":
			return Type.Boolean({ description });
		case "object":
			return Type.Record(Type.String(), Type.Unknown(), { description });
		case "file":
			return Type.Any({ description });
		case "array":
			return Type.Array(featureArrayItemSchema(parameter.arrayType), { description });
	}
}

function featureArrayItemSchema(arrayType: FeatureParameter["arrayType"]): TSchema {
	switch (arrayType) {
		case "number":
			return Type.Number();
		case "file":
			return Type.Any();
		case "object":
			return Type.Record(Type.String(), Type.Unknown());
		case "string":
		case undefined:
			return Type.String();
	}
}

function textToolResult(text: string): AgentToolResult<unknown> {
	return { content: [{ type: "text", text }], details: text };
}

function jsonToolResult(value: unknown): AgentToolResult<unknown> {
	return { content: [{ type: "text", text: stringify(value) }], details: value };
}

function stringify(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

function assertUniqueAliases(entries: ToolEntry[]): void {
	const seen = new Map<string, string>();
	for (const entry of entries) {
		for (const alias of new Set([entry.name, ...entry.aliases])) {
			const owner = seen.get(alias);
			if (owner !== undefined && owner !== entry.name) {
				throw new AntboxError(
					"DuplicateToolAlias",
					`Duplicate AI tool alias '${alias}' on '${entry.name}' (also on '${owner}')`,
				);
			}
			seen.set(alias, entry.name);
		}
	}
}
