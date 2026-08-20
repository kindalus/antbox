import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { type TSchema, Type } from "@earendil-works/pi-ai";
import { type Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { FeatureData, FeatureParameter } from "domain/configuration/feature_data.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeService } from "../nodes/node_service.ts";
import type { AspectsService } from "../aspects/aspects_service.ts";
import type { FeaturesService } from "../features/features_service.ts";
import type { RAGService } from "./rag_service.ts";
import { NodeServiceProxy } from "../nodes/node_service_proxy.ts";
import { AspectServiceProxy } from "../aspects/aspect_service_proxy.ts";
import { createRunCodeTool } from "./builtin_tools/run_code.ts";
import { type LoadedSkill, loadSkillInstruction } from "./skills_loader.ts";
import type { FeatureAIToolExecutor } from "./agents_engine_interface.ts";

const DEFAULT_TOOL_NAME = "load_skill";

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

export interface BuildToolSetContext {
	readonly nodeService: NodeService;
	readonly aspectsService: AspectsService;
	readonly featuresService: FeaturesService;
	readonly ragService?: RAGService;
	readonly skills: LoadedSkill[];
	readonly featureAIToolExecutor?: FeatureAIToolExecutor;
}

export interface BuiltToolSet {
	readonly tools: AnyAgentTool[];
	readonly toolNames: string[];
}

export async function buildToolSet(
	ctx: BuildToolSetContext,
	agentData: AgentData,
	authContext: AuthenticationContext,
): Promise<Either<AntboxError, BuiltToolSet>> {
	const allEntries = await buildAllToolEntries(ctx, agentData, authContext);
	if (allEntries.isLeft()) return left(allEntries.value);

	const selected = selectEntries(allEntries.value, agentData.tools);
	return right({
		tools: selected.map((entry) => entry.tool),
		toolNames: selected.map((entry) => entry.name),
	});
}

interface ToolEntry {
	readonly name: string;
	readonly aliases: readonly string[];
	readonly tool: AnyAgentTool;
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
	const nodeProxy = new NodeServiceProxy(ctx.nodeService, ctx.ragService, authContext);
	const aspectProxy = new AspectServiceProxy(ctx.aspectsService, authContext);
	const runCode = createRunCodeTool(nodeProxy, aspectProxy, {});

	const builtIn: ToolEntry[] = [
		{
			name: "run_code",
			aliases: [],
			tool: {
				name: "run_code",
				label: "Run code",
				description:
					"Execute JavaScript/TypeScript code for advanced multi-step workflows involving nodes and aspects.",
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
					'Find nodes by plain-text search, or by structured filters as a JSON-encoded array of [field, operator, value] tuples (e.g. \'[["title","contains","policy"]]\').',
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
				description: "Run semantic search over indexed node content.",
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
			name: DEFAULT_TOOL_NAME,
			aliases: [],
			tool: {
				name: DEFAULT_TOOL_NAME,
				label: "Load skill",
				description: "Load a discovered skill by name to get its full instructions.",
				parameters: Type.Object({
					name: Type.String({ minLength: 1, description: "Skill name to load" }),
				}),
				execute: async (_id, params) => {
					const { name } = params as { name: string };
					const skillName = name.trim();
					const skill = ctx.skills.find((candidate) =>
						candidate.frontmatter.name === skillName &&
						isSkillAllowed(agentData.skills, candidate)
					);
					if (!skill) throw new Error(`Skill '${skillName}' not found`);

					const instruction = await loadSkillInstruction(skill.skillFile);
					if (!instruction) throw new Error(`Failed to load skill '${skillName}'`);
					const text = [
						`<skill name="${skill.frontmatter.name}" location="${skill.skillFile}">`,
						`References are relative to ${skill.skillDir}.`,
						"",
						instruction,
						"</skill>",
					].join("\n");
					return { content: [{ type: "text", text }], details: { skillDir: skill.skillDir } };
				},
			},
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
	return right(aiToolsOrErr.value.map((feature) => featureToToolEntry(ctx, authContext, feature)));
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

function toSnakeCase(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();
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
