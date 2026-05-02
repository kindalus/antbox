import { tool, type Tool } from "ai";
import { z } from "zod";
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

/**
 * Parse a `filters` argument from `find_nodes`. Gemini's function-declaration schema
 * cannot represent the original `string | Filter[] | Filter[][]` union (rejects
 * `items.items` and `items` on non-array union members), so we accept a single
 * string and parse it: JSON-encoded array → structured filters; otherwise → plain
 * text search.
 */
function parseFindFilters(input: string): NodeFilters | string {
	const trimmed = input.trim();
	if (!(trimmed.startsWith("[") && trimmed.endsWith("]"))) {
		return input;
	}
	try {
		const parsed = JSON.parse(trimmed);
		if (Array.isArray(parsed) && parsed.length > 0) {
			return parsed as NodeFilters;
		}
		return input;
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
	tools: Record<string, Tool>;
	toolNames: string[];
}

export async function buildToolSet(
	ctx: BuildToolSetContext,
	agentData: AgentData,
	authContext: AuthenticationContext,
): Promise<Either<AntboxError, BuiltToolSet>> {
	const allEntries = await buildAllToolEntries(ctx, authContext);
	if (allEntries.isLeft()) return left(allEntries.value);

	const selected = selectEntries(allEntries.value, agentData.tools);
	const toolMap: Record<string, Tool> = {};
	for (const entry of selected) {
		toolMap[entry.name] = entry.tool;
	}
	return right({ tools: toolMap, toolNames: selected.map((entry) => entry.name) });
}

interface ToolEntry {
	readonly name: string;
	readonly aliases: readonly string[];
	readonly tool: Tool;
}

function selectEntries(all: ToolEntry[], tools: AgentData["tools"]): ToolEntry[] {
	if (tools === true) return all;

	const isDefault = (entry: ToolEntry) => entry.name === DEFAULT_TOOL_NAME;

	if (tools === false || tools === undefined || tools.length === 0) {
		return all.filter(isDefault);
	}

	const allowed = new Set(tools);
	return all.filter((entry) => {
		if (isDefault(entry)) return true;
		if (allowed.has(entry.name)) return true;
		return entry.aliases.some((alias) => allowed.has(alias));
	});
}

async function buildAllToolEntries(
	ctx: BuildToolSetContext,
	authContext: AuthenticationContext,
): Promise<Either<AntboxError, ToolEntry[]>> {
	const nodeProxy = new NodeServiceProxy(ctx.nodeService, ctx.ragService, authContext);
	const aspectProxy = new AspectServiceProxy(ctx.aspectsService, authContext);
	const runCodeFn = createRunCodeTool(nodeProxy, aspectProxy, {});

	const builtIn: ToolEntry[] = [
		{
			name: "run_code",
			aliases: [],
			tool: tool({
				description:
					"Execute JavaScript/TypeScript code for advanced multi-step workflows involving nodes and aspects.",
				inputSchema: z.object({
					code: z.string().describe(
						"ESM JavaScript/TypeScript module code with a default export function",
					),
				}),
				execute: ({ code }: { code: string }) => runCodeFn(code),
			}),
		},
		{
			name: "find_nodes",
			aliases: [],
			tool: tool({
				description:
					"Find nodes by plain-text search, or by structured filters as a JSON-encoded array of [field, operator, value] tuples (e.g. '[[\"title\",\"contains\",\"policy\"]]').",
				inputSchema: z.object({
					filters: z.string().min(1).describe(
						"Plain-text search string, or a JSON-encoded array of [field, operator, value] tuples for structured filtering",
					),
					page_size: z.number().int().min(1).max(200).optional(),
					page_token: z.number().int().min(1).optional(),
				}),
				execute: async ({ filters, page_size, page_token }) => {
					const result = await nodeProxy.find(
						parseFindFilters(filters),
						page_size,
						page_token,
					);
					if (result.isLeft()) throw new Error(result.value.message);
					return result.value;
				},
			}),
		},
		{
			name: "get_node",
			aliases: [],
			tool: tool({
				description: "Get a single node by UUID.",
				inputSchema: z.object({ uuid: z.string().min(1) }),
				execute: async ({ uuid }) => {
					const result = await nodeProxy.get(uuid);
					if (result.isLeft()) throw new Error(result.value.message);
					return result.value;
				},
			}),
		},
		{
			name: "semantic_search",
			aliases: [],
			tool: tool({
				description: "Run semantic search over indexed node content.",
				inputSchema: z.object({ query: z.string().min(1) }),
				execute: async ({ query }) => {
					const result = await nodeProxy.semanticQuery(query);
					if (result.isLeft()) {
						throw new Error(
							result.value instanceof Error ? result.value.message : String(result.value),
						);
					}
					return Array.isArray(result.value) ? { results: result.value } : result.value;
				},
			}),
		},
		{
			name: DEFAULT_TOOL_NAME,
			aliases: [],
			tool: tool({
				description: "Load a discovered skill by name to get its full instructions.",
				inputSchema: z.object({
					name: z.string().min(1).describe("Skill name to load"),
				}),
				execute: async ({ name }) => {
					const skillName = String(name).trim();
					const skill = ctx.skills.find((s) => s.frontmatter.name === skillName);
					if (!skill) throw new Error(`Skill '${skillName}' not found`);

					const instruction = await loadSkillInstruction(skill.skillFile);
					if (!instruction) throw new Error(`Failed to load skill '${skillName}'`);

					return [
						`<skill name="${skill.frontmatter.name}" location="${skill.skillFile}">`,
						`References are relative to ${skill.skillDir}.`,
						"",
						instruction,
						"</skill>",
					].join("\n");
				},
			}),
		},
	];

	const featureToolsOrErr = await buildFeatureAITools(ctx, authContext);
	if (featureToolsOrErr.isLeft()) return left(featureToolsOrErr.value);

	const all = [...builtIn, ...featureToolsOrErr.value];
	assertUniqueAliases(all);
	return right(all);
}

async function buildFeatureAITools(
	ctx: BuildToolSetContext,
	authContext: AuthenticationContext,
): Promise<Either<AntboxError, ToolEntry[]>> {
	const aiToolsOrErr = await ctx.featuresService.listAITools(authContext);
	if (aiToolsOrErr.isLeft()) return left(aiToolsOrErr.value);

	return right(
		aiToolsOrErr.value.map((feature) => featureToToolEntry(ctx, authContext, feature)),
	);
}

function featureToToolEntry(
	ctx: BuildToolSetContext,
	authContext: AuthenticationContext,
	feature: FeatureData,
): ToolEntry {
	const toolName = toSnakeCase(feature.uuid);
	const aliases = toolName === feature.uuid ? [] : [feature.uuid];
	const aliasEntries = featureParameterAliases(feature.parameters);
	const inputSchema = featureParametersToSchema(aliasEntries);

	return {
		name: toolName,
		aliases,
		tool: tool({
			description: feature.description,
			inputSchema,
			execute: async (params: Record<string, unknown>) => {
				if (!ctx.featureAIToolExecutor) {
					throw new Error("Feature AI tool executor not available");
				}
				const mapped = mapFeatureParameters(aliasEntries, params);
				const resultOrErr = await ctx.featureAIToolExecutor.runAITool(
					authContext,
					feature.uuid,
					mapped,
				);
				if (resultOrErr.isLeft()) throw new Error(resultOrErr.value.message);
				const value = resultOrErr.value;
				return Array.isArray(value) ? { results: value } : value;
			},
		}),
	};
}

function featureParameterAliases(parameters: FeatureParameter[]) {
	const aliasEntries = parameters.map((parameter) => ({
		parameter,
		exposedName: toSnakeCase(parameter.name),
	}));
	const seen = new Set<string>();
	for (const entry of aliasEntries) {
		if (seen.has(entry.exposedName)) {
			throw new AntboxError(
				"FeatureParameterAliasCollision",
				`Feature parameter alias collision for '${entry.exposedName}' on parameter '${entry.parameter.name}'`,
			);
		}
		seen.add(entry.exposedName);
	}
	return aliasEntries;
}

function mapFeatureParameters(
	aliases: Array<{ parameter: FeatureParameter; exposedName: string }>,
	params: Record<string, unknown>,
): Record<string, unknown> {
	const mapped: Record<string, unknown> = {};
	for (const alias of aliases) {
		if (alias.exposedName in params) {
			mapped[alias.parameter.name] = params[alias.exposedName];
		}
	}
	return mapped;
}

function featureParametersToSchema(
	aliases: Array<{ parameter: FeatureParameter; exposedName: string }>,
) {
	const shape: Record<string, z.ZodTypeAny> = {};
	for (const { parameter, exposedName } of aliases) {
		const description = parameter.description ?? parameter.name;
		let schema: z.ZodTypeAny;
		switch (parameter.type) {
			case "string":
				schema = z.string();
				break;
			case "date":
				schema = z.string().describe(`${description} (ISO-8601 date string)`);
				break;
			case "number":
				schema = z.number();
				break;
			case "boolean":
				schema = z.boolean();
				break;
			case "object":
				schema = z.record(z.string(), z.unknown());
				break;
			case "file":
				schema = z.instanceof(File);
				break;
			case "array":
				schema = z.array(featureArrayItemSchema(parameter.arrayType));
				break;
		}

		shape[exposedName] = parameter.required
			? schema.describe(description)
			: schema.optional().describe(description);
	}
	return z.object(shape);
}

function featureArrayItemSchema(arrayType: FeatureParameter["arrayType"]): z.ZodTypeAny {
	switch (arrayType) {
		case "number":
			return z.number();
		case "file":
			return z.instanceof(File);
		case "object":
			return z.record(z.string(), z.unknown());
		case "string":
		case undefined:
			return z.string();
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
		const aliases = new Set([entry.name, ...entry.aliases]);
		for (const alias of aliases) {
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
