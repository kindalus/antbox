import { Logger } from "shared/logger.ts";
import { kebabToCamelCase } from "shared/string_utils.ts";
import { loadTemplate, TEMPLATES } from "api/templates/index.ts";
import {
	AUTO_TAG_FEATURE_UUID,
	CALL_AGENT_FEATURE_UUID,
} from "domain/configuration/builtin_features.ts";
import type { FeatureParameter } from "domain/configuration/feature_data.ts";
import { ASPECT_FIELD_EXTRACTOR_AGENT_UUID } from "application/ai/builtin_agents/aspect_field_extractor_agent.ts";
import { EmbeddingCreatedEvent } from "domain/nodes/embedding_created_event.ts";
import { EmbeddingUpdatedEvent } from "domain/nodes/embedding_updated_event.ts";
import type { AspectsService } from "application/aspects/aspects_service.ts";
import { type Feature, featureDataToFeature } from "domain/features/feature.ts";
import { RunContext } from "domain/features/feature_run_context.ts";
import { NodeLike } from "domain/node_like.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { AntboxError, BadRequestError, ForbiddenError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { EventBus } from "shared/event_bus.ts";
import { ValidationError } from "shared/validation_error.ts";
import { DOCS, loadDoc } from "../../../docs/index.ts";
import type { OCRProvider } from "domain/ai/ocr_provider.ts";
import type { ChatMessage } from "domain/ai/chat_message.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { toYamlMetadata } from "../nodes/node_markdown.ts";
import { NodeService } from "../nodes/node_service.ts";
import { NodeServiceProxy } from "../nodes/node_service_proxy.ts";
import type { FeaturesService } from "./features_service.ts";
import { RAGService } from "../ai/rag_service.ts";

const MAX_RUNNABLE_DEPTH = 3;

type RecordKey = [string, string];
interface RunnableRecord {
	count: number;
	timestamp: number;
}

export interface AgentAnswerExecutor {
	answer(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
	): Promise<Either<AntboxError, ChatMessage>>;
}

export interface FeaturesEngineContext {
	featuresService: FeaturesService;
	nodeService: NodeService;
	agentsEngine?: AgentAnswerExecutor;
	aspectsService?: AspectsService;
	ocrProvider?: OCRProvider;
	ragService?: RAGService;
	eventBus: EventBus;
}

/**
 * FeaturesEngine - Handles execution of features (actions, extensions, AI tools)
 *
 * This engine is responsible for:
 * - Running actions on nodes
 * - Running AI tools
 * - Running extensions (HTTP endpoints)
 * - Handling automatic triggers (onCreate, onUpdate, onDelete)
 * - Handling folder hooks
 */
export class FeaturesEngine {
	static #runnable: Map<RecordKey, RunnableRecord> = new Map();

	readonly #featuresService: FeaturesService;
	readonly #nodeService: NodeService;
	readonly #agentsEngine?: AgentAnswerExecutor;
	readonly #aspectsService?: AspectsService;
	readonly #ocrProvider?: OCRProvider;
	readonly #ragService?: RAGService;

	constructor(ctx: FeaturesEngineContext) {
		this.#featuresService = ctx.featuresService;
		this.#nodeService = ctx.nodeService;
		this.#agentsEngine = ctx.agentsEngine;
		this.#aspectsService = ctx.aspectsService;
		this.#ocrProvider = ctx.ocrProvider;
		this.#ragService = ctx.ragService;

		// Register event handlers for domain-wide triggers
		// AUTOMATIC TRIGGERS
		ctx.eventBus.subscribe(NodeCreatedEvent.EVENT_ID, {
			handle: (evt: NodeCreatedEvent) => this.#runOnCreate(evt),
		});

		ctx.eventBus.subscribe(NodeUpdatedEvent.EVENT_ID, {
			handle: (evt: NodeUpdatedEvent) => this.#runOnUpdate(evt),
		});

		ctx.eventBus.subscribe(NodeDeletedEvent.EVENT_ID, {
			handle: (evt: NodeDeletedEvent) => this.#runOnDelete(evt),
		});

		ctx.eventBus.subscribe(EmbeddingCreatedEvent.EVENT_ID, {
			handle: (evt: EmbeddingCreatedEvent) => this.#runOnEmbeddingsCreated(evt),
		});

		ctx.eventBus.subscribe(EmbeddingUpdatedEvent.EVENT_ID, {
			handle: (evt: EmbeddingUpdatedEvent) => this.#runOnEmbeddingsUpdated(evt),
		});

		// FOLDER HOOKS
		ctx.eventBus.subscribe(NodeCreatedEvent.EVENT_ID, {
			handle: (evt: NodeCreatedEvent) => this.#runOnCreateFolderHooks(evt),
		});

		ctx.eventBus.subscribe(NodeUpdatedEvent.EVENT_ID, {
			handle: (evt: NodeUpdatedEvent) => this.#runOnUpdatedFolderHooks(evt),
		});

		ctx.eventBus.subscribe(NodeDeletedEvent.EVENT_ID, {
			handle: (evt: NodeDeletedEvent) => this.#runOnDeleteFolderHooks(evt),
		});
	}

	/**
	 * Executes a feature action on a set of nodes.
	 *
	 * This method performs several validation and filtering steps before executing:
	 *
	 * 1. **Feature Validation**: Verifies the feature exists and is exposed as an action
	 * 2. **Manual Execution Check**: Ensures the feature can be run manually if invoked directly
	 * 3. **Node Filtering**: Filters the provided node UUIDs based on the feature's filter criteria
	 *    - Retrieves each node (with permission checks via NodeService)
	 *    - Logs warnings for nodes that can't be retrieved
	 *    - Applies the feature's NodeFilter specification
	 *    - Only passes matching nodes to the action
	 * 4. **Execution Tracking**: Uses a counter to track concurrent action executions
	 * 5. **Error Handling**: Catches and wraps execution errors
	 *
	 * The filtered node UUIDs are passed to the action as the "uuids" parameter,
	 * merged with any additional parameters provided by the caller.
	 *
	 * @param ctx - Authentication context for permission checks and execution context
	 * @param uuid - UUID of the feature/action to run
	 * @param uuids - Array of node UUIDs to apply the action to
	 * @param params - Optional additional parameters for the action
	 * @returns Either an error or the action result (type T)
	 *
	 * @example
	 * ```typescript
	 * // Run "copy_to_folder" action on selected nodes
	 * const result = await featuresEngine.runAction(
	 *   ctx,
	 *   "copy_to_folder",
	 *   ["node-uuid-1", "node-uuid-2"],
	 *   { to: "target-folder-uuid" }
	 * );
	 * ```
	 */
	async runAction<T>(
		ctx: AuthenticationContext,
		uuid: string,
		uuids: string[],
		params?: Record<string, unknown>,
	): Promise<Either<AntboxError, T>> {
		// First check if the feature exists and is exposed as action
		const featureOrErr = await this.#featuresService.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeAction) {
			return left(new BadRequestError("Feature is not exposed as action"));
		}

		if (ctx.mode === "Direct" && !feature.runManually) {
			return left(new BadRequestError("Feature is not run manually"));
		}

		// Filter node UUIDs based on the feature's filter criteria
		const nodesOrErrs = await Promise.all(uuids.map((uuid) => this.#nodeService.get(ctx, uuid)));

		// Helper to filter out error results and log warnings
		const filterAndLog = (nodeOrErr: Either<AntboxError, NodeMetadata>) => {
			if (nodeOrErr.isLeft()) {
				Logger.warn("Error retrieving the node", nodeOrErr.value.message);
			}
			return nodeOrErr.isRight();
		};

		// Extract successfully retrieved nodes, apply filters, get UUIDs
		const nodes = nodesOrErrs.filter(filterAndLog)
			.map((n) => n.value as NodeMetadata)
			.filter((n) => NodesFilters.satisfiedBy(feature.filters || [], n as NodeLike).isRight())
			.map((n) => n.uuid!);

		try {
			// Track concurrent action executions
			FeaturesEngine.#incRunnable([uuid, "action"]);
			return await this.#run(ctx, uuid, { ...params, uuids: nodes });
		} catch (error) {
			return left(
				new UnknownError(`Action error: ${(error as Error).message}`),
			);
		} finally {
			FeaturesEngine.#decRunnable([uuid, "action"]);
		}
	}

	async runAITool<T>(
		ctx: AuthenticationContext,
		uuid: string,
		parameters: Record<string, unknown>,
	): Promise<Either<AntboxError, T>> {
		if (uuid.includes(":")) {
			return this.#runNodeServiceMethodAsTool(ctx, uuid, parameters);
		}

		// First check if the feature exists and is exposed as AI tool
		const featureOrErr = await this.#featuresService.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeAITool) {
			return left(new BadRequestError("Feature is not exposed as AI tool"));
		}

		return this.#run(ctx, uuid, parameters);
	}

	/**
	 * Executes built-in system methods as AI tools.
	 *
	 * This internal method provides a bridge between AI agents and core system services.
	 * It accepts specially formatted tool names (e.g., "NodeService:find") and routes
	 * them to the corresponding service methods.
	 *
	 * **Supported Tools:**
	 * - **NodeService methods**: find, get, create, duplicate, copy, breadcrumbs, delete, update, export, list
	 * - **OcrModel methods**: ocr (optical character recognition)
	 * - **Templates methods**: list (template enumeration)
	 * - **Docs methods**: list, get (documentation access)
	 *
	 * This allows AI agents to:
	 * - Search and retrieve content
	 * - Manipulate nodes (create, update, delete)
	 * - Extract text from images via OCR
	 * - Access system templates and documentation
	 *
	 * The method name format is "ServiceName:methodName" (e.g., "NodeService:find").
	 * Arguments are passed as a record and mapped to the appropriate parameters.
	 *
	 * @param ctx - Authentication context (permissions apply to all operations)
	 * @param name - Fully qualified tool name (format: "ServiceName:methodName")
	 * @param args - Arguments for the tool, structure depends on the specific tool
	 * @returns Either an error or the tool execution result
	 *
	 * @throws UnknownError if the tool name is not recognized
	 *
	 * @example
	 * ```typescript
	 * // AI agent calling the find tool
	 * const result = await runNodeServiceMethodAsTool(
	 *   ctx,
	 *   "NodeService:find",
	 *   { filters: [["mimetype", "==", "application/pdf"]], pageSize: 10 }
	 * );
	 * ```
	 */
	async #runNodeServiceMethodAsTool<T>(
		ctx: AuthenticationContext,
		name: string,
		args: Record<string, unknown>,
	): Promise<Either<AntboxError, T>> {
		// deno-lint-ignore no-explicit-any
		let result: any;
		let fileOrErr: Either<AntboxError, File>;
		try {
			// Route tool calls to appropriate service methods
			switch (name) {
				case "NodeService:find":
					result = this.#nodeService.find(
						ctx,
						args.filters as NodeFilters,
						args.pageSize as number ?? 20,
						args.pageToken as number ?? 1,
					);
					break;
				case "NodeService:get":
					result = this.#nodeService.get(ctx, args.uuid as string);
					break;
				case "NodeService:create":
					result = this.#nodeService.create(ctx, args.metadata as NodeMetadata);
					break;
				case "NodeService:duplicate":
					result = this.#nodeService.duplicate(ctx, args.uuid as string);
					break;
				case "NodeService:copy":
					result = this.#nodeService.copy(ctx, args.uuid as string, args.parent as string);
					break;
				case "NodeService:breadcrumbs":
					result = this.#nodeService.breadcrumbs(ctx, args.uuid as string);
					break;
				case "NodeService:delete":
					result = this.#nodeService.delete(ctx, args.uuid as string);
					break;
				case "NodeService:update":
					result = this.#nodeService.update(
						ctx,
						args.uuid as string,
						args.metadata as NodeMetadata,
					);
					break;

				case "NodeService:export":
					result = this.#nodeService.export(ctx, args.uuid as string);
					break;

				case "NodeService:list":
					result = this.#nodeService.list(ctx, args.parent as string);
					break;

				case "OcrModel:ocr":
					if (!this.#ocrProvider) {
						return left(new UnknownError("OCR provider not initialized"));
					}
					fileOrErr = await this.#nodeService.export(ctx, args.uuid as string);
					if (fileOrErr.isLeft()) {
						return left(fileOrErr.value);
					}
					result = this.#ocrProvider.ocr(fileOrErr.value);
					break;
				case "Templates:list":
					result = right(TEMPLATES);
					break;
				case "Templates:get": {
					const template = await loadTemplate(args.uuid as string);
					if (!template) {
						return left(new NodeNotFoundError(`Template '${args.uuid}' not found`));
					}
					result = right(template.content);
					break;
				}
				case "Docs:list":
					result = right(DOCS);
					break;
				case "Docs:get": {
					const doc = await loadDoc(args.uuid as string);
					if (!doc) {
						return left(new NodeNotFoundError(`Documentation '${args.uuid}' not found`));
					}
					result = right(doc.content);
					break;
				}
			}
		} catch (err: unknown) {
			return left(new BadRequestError("Unknown error: ".concat((err as Error).message)));
		}

		if (!result) {
			return left(new BadRequestError("Unknown tool"));
		}

		return result;
	}

	async runExtension(
		ctx: AuthenticationContext,
		uuid: string,
		request: Request,
	): Promise<Response> {
		// First check if the feature is exposed as extension
		const featureOrErr = await this.#featuresService.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return new Response(featureOrErr.value.message, {
				status: featureOrErr.value instanceof ForbiddenError ? 403 : 404,
			});
		}

		const feature = featureOrErr.value;
		if (!feature.exposeExtension) {
			return new Response("Feature is not exposed as extension", { status: 400 });
		}

		const paramsOrErr = await this.#extractParametersFromRequest(request);
		if (paramsOrErr.isLeft()) {
			return new Response(paramsOrErr.value.message, { status: 400 });
		}

		const params = Object.fromEntries(
			Object.entries(paramsOrErr.value).map(([k, v]) => [kebabToCamelCase(k), v]),
		);

		const resultOrErr = await this.#run(ctx, uuid, params);
		if (resultOrErr.isLeft()) {
			let errCode = 500;

			if (resultOrErr.value instanceof ValidationError) {
				errCode = 400;
			}

			if (resultOrErr.value instanceof BadRequestError) {
				errCode = 400;
			}

			if (resultOrErr.value instanceof ForbiddenError) {
				errCode = 403;
			}

			return new Response(resultOrErr.value.message, { status: errCode });
		}

		const result = resultOrErr.value;

		if (!result) {
			return new Response("OK", { status: 200 });
		}

		switch (feature.returnType) {
			case "file":
				return this.#respondeWithFile(result as File);

			case "array":
			case "object":
				return this.#respondeWithJson(result);

			case "void":
				return new Response("OK", { status: 200 });

			default:
				return new Response(`${result}`, {
					headers: new Headers({
						"Content-Type": feature.returnContentType ?? "text/plain",
					}),
					status: 200,
				});
		}
	}

	// ===== PRIVATE EXECUTION HELPERS =====

	static #decRunnable(key: RecordKey) {
		const runnable = this.#getRunnable(key);
		if (runnable && runnable.count > 1) {
			this.#runnable.set(key, {
				count: runnable.count - 1,
				timestamp: Date.now(),
			});
		} else {
			this.#runnable.delete(key);
		}
	}

	static #getRunnable(key: RecordKey): RunnableRecord {
		if (!this.#runnable.has(key)) {
			this.#runnable.set(key, { count: 0, timestamp: Date.now() });
		}

		return this.#runnable.get(key)!;
	}

	static #incRunnable(key: RecordKey) {
		const runnable = this.#getRunnable(key);
		this.#runnable.set(key, {
			count: (runnable?.count ?? 0) + 1,
			timestamp: Date.now(),
		});
	}

	async #extractParametersFromRequest(
		request: Request,
	): Promise<Either<BadRequestError, Record<string, unknown>>> {
		if (request.method !== "GET" && request.method !== "POST") {
			return left(new BadRequestError("Unsupported HTTP method"));
		}

		if (request.method === "GET") {
			const url = new URL(request.url);
			const params: Record<string, unknown> = {};
			url.searchParams.forEach((value, key) => {
				params[key] = value;
			});

			return right(params);
		}

		const contentType = request.headers.get("content-type") || "";

		if (contentType.includes("application/json")) {
			const params = await request.json();
			return right(params);
		}

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			const formData = await request.formData();
			const params: Record<string, unknown> = {};
			formData.forEach((value, key) => {
				params[key] = value;
			});

			return right(params);
		}

		return left(new BadRequestError(`Unsupported content type: ${contentType}`));
	}

	async #getAutomaticActions(
		criteria: NodeFilters,
		ctx: AuthenticationContext,
	): Promise<Feature[]> {
		const actionsOrErr = await this.#featuresService.listActions(ctx);

		if (actionsOrErr.isLeft()) {
			return [];
		}

		const runnables = actionsOrErr.value
			.filter((a) => {
				const matchesOrErr = NodesFilters.satisfiedBy(criteria, a as unknown as NodeLike);
				return matchesOrErr.isRight() && matchesOrErr.value;
			})
			.map((a) => this.#getFeatureAsRunnableFeature(ctx, a.uuid));

		const featuresOrErrs = await Promise.all(runnables);

		featuresOrErrs.filter((v) => v.isLeft())
			.forEach((v) => {
				Logger.warn(v.value.message);
			});

		return featuresOrErrs.filter((v) => v.isRight()).map((v) => v.value);
	}

	async #runFolderHookAction(
		ctx: AuthenticationContext,
		featureUuid: string,
		nodeUuid: string,
		parameters: Record<string, string>,
		hookName: "onCreate" | "onUpdate" | "onDelete",
	): Promise<void> {
		const current = FeaturesEngine.#getRunnable([featureUuid, "action"]);
		if (current.count > MAX_RUNNABLE_DEPTH) {
			Logger.warn(
				`Skipping folder ${hookName} feature ${featureUuid}: max runnable depth (${MAX_RUNNABLE_DEPTH}) exceeded`,
			);
			return;
		}

		const result = await this.runAction(ctx, featureUuid, [nodeUuid], parameters);
		if (result.isLeft()) {
			Logger.warn(
				`Skipping folder ${hookName} feature ${featureUuid} for node ${nodeUuid}: ${result.value.message}`,
			);
		}
	}

	async #runAutomaticAction(
		ctx: AuthenticationContext,
		feature: Feature,
		node: NodeMetadata,
		triggerName: "onCreate" | "onUpdate" | "onDelete",
	): Promise<void> {
		const filterOrErr = NodesFilters.satisfiedBy(
			feature.filters || [],
			node as unknown as NodeLike,
		);
		if (filterOrErr.isLeft() || !filterOrErr.value) {
			return;
		}

		if (!feature.exposeAction) {
			Logger.warn(`Skipping non-action automatic feature ${feature.uuid}`);
			return;
		}

		const current = FeaturesEngine.#getRunnable([feature.uuid, "action"]);
		if (current.count > MAX_RUNNABLE_DEPTH) {
			Logger.warn(
				`Skipping automatic ${triggerName} feature ${feature.uuid}: max runnable depth (${MAX_RUNNABLE_DEPTH}) exceeded`,
			);
			return;
		}

		try {
			FeaturesEngine.#incRunnable([feature.uuid, "action"]);
			const result = await this.#run(ctx, feature.uuid, { uuids: [node.uuid] });
			if (result.isLeft()) {
				Logger.warn(
					`Skipping automatic ${triggerName} feature ${feature.uuid} for node ${node.uuid}: ${result.value.message}`,
				);
			}
		} finally {
			FeaturesEngine.#decRunnable([feature.uuid, "action"]);
		}
	}

	async #getNodeMetadataForUpdateTrigger(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<NodeMetadata | undefined> {
		const nodeOrErr = await this.#nodeService.get(ctx, uuid);
		if (nodeOrErr.isLeft()) {
			Logger.warn(
				`Skipping automatic onUpdate features for node ${uuid}: ${nodeOrErr.value.message}`,
			);
			return undefined;
		}

		return nodeOrErr.value;
	}

	async #getFeatureAsRunnableFeature(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, Feature>> {
		const featureDataOrErr = await this.#featuresService.getFeature(ctx, uuid);

		if (featureDataOrErr.isLeft()) {
			return left(featureDataOrErr.value);
		}

		const featureData = featureDataOrErr.value;

		return featureDataToFeature(featureData);
	}

	#respondeWithFile(file: File): Response {
		return new Response(file, {
			headers: {
				"Content-Type": file.type,
				"Content-Disposition": `attachment; filename="${file.name}"`,
			},
		});
	}

	#respondeWithJson(value: unknown[] | object) {
		return new Response(JSON.stringify(value), {
			headers: {
				"Content-Type": "application/json",
			},
		});
	}

	async #runBuiltinFeature<T>(
		ctx: AuthenticationContext,
		feature: Feature,
		params: Record<string, unknown>,
	): Promise<Either<AntboxError, T> | undefined> {
		if (feature.uuid === CALL_AGENT_FEATURE_UUID) {
			return this.#runCallAgentFeature(ctx, params) as Promise<Either<AntboxError, T>>;
		}

		if (feature.uuid === AUTO_TAG_FEATURE_UUID) {
			return this.#runAutoTagFeature(ctx, params) as Promise<Either<AntboxError, T>>;
		}

		return undefined;
	}

	async #runCallAgentFeature(
		ctx: AuthenticationContext,
		params: Record<string, unknown>,
	): Promise<Either<AntboxError, { status: "started" | "completed"; message?: ChatMessage }>> {
		if (!this.#agentsEngine) {
			return left(new BadRequestError("Agents engine not available"));
		}

		const agentUuid = params.agentUuid;
		if (typeof agentUuid !== "string" || agentUuid.trim().length === 0) {
			return left(new BadRequestError("Parameter 'agentUuid' must be a non-empty string"));
		}

		const prompt = params.prompt;
		if (typeof prompt !== "string" || prompt.trim().length === 0) {
			return left(new BadRequestError("Parameter 'prompt' must be a non-empty string"));
		}

		const uuids = Array.isArray(params.uuids)
			? params.uuids.filter((uuid): uuid is string => typeof uuid === "string")
			: [];
		const runSync = this.#toBoolean(params.runSync, false);
		const finalPrompt = await this.#buildCallAgentPrompt(ctx, uuids, prompt);

		if (finalPrompt.isLeft()) {
			return left(finalPrompt.value);
		}

		if (!runSync) {
			void this.#agentsEngine.answer(ctx, agentUuid.trim(), finalPrompt.value)
				.then((result) => {
					if (result.isLeft()) {
						Logger.error(
							`Background agent action ${CALL_AGENT_FEATURE_UUID} failed for agent ${agentUuid}: ${result.value.message}`,
						);
					}
				})
				.catch((error) => {
					Logger.error(
						`Background agent action ${CALL_AGENT_FEATURE_UUID} failed for agent ${agentUuid}:`,
						error,
					);
				});

			return right({ status: "started" });
		}

		const answerOrErr = await this.#agentsEngine.answer(ctx, agentUuid.trim(), finalPrompt.value);
		if (answerOrErr.isLeft()) {
			return left(answerOrErr.value);
		}

		return right({
			status: "completed",
			message: answerOrErr.value,
		});
	}

	async #buildCallAgentPrompt(
		ctx: AuthenticationContext,
		uuids: string[],
		prompt: string,
	): Promise<Either<AntboxError, string>> {
		const nodesOrErr = await Promise.all(uuids.map((uuid) => this.#nodeService.get(ctx, uuid)));
		const nodes = nodesOrErr
			.filter((nodeOrErr) => nodeOrErr.isRight())
			.map((nodeOrErr) => nodeOrErr.value);

		const contentsOrErr = await this.#nodeService.getEmbeddingContents(
			ctx,
			nodes.map((node) => node.uuid),
		);
		if (contentsOrErr.isLeft()) {
			return left(contentsOrErr.value);
		}

		const relevantNodes = nodes.map((node, index) => {
			const contentMd = contentsOrErr.value[node.uuid];

			if (contentMd) {
				return contentMd;
			}

			return `[ metadata for node ${index} ]\n${toYamlMetadata(node)}`;
		});

		return right(
			`${prompt.trimEnd()}\n\nRelevant nodes metadata:\n\n${relevantNodes.join("\n\n")}`,
		);
	}

	#toBoolean(value: unknown, defaultValue: boolean): boolean {
		if (typeof value === "boolean") {
			return value;
		}

		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			if (["true", "1", "yes", "y"].includes(normalized)) {
				return true;
			}

			if (["false", "0", "no", "n", ""].includes(normalized)) {
				return false;
			}
		}

		return defaultValue;
	}

	async #run<T>(
		ctx: AuthenticationContext,
		uuid: string,
		params: Record<string, unknown>,
	): Promise<Either<AntboxError, T>> {
		const featureOrErr = await this.#getFeatureAsRunnableFeature(ctx, uuid);

		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;

		if (
			feature.groupsAllowed &&
			feature.groupsAllowed.length &&
			!ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID) &&
			!ctx.principal.groups.some((group) => feature.groupsAllowed.includes(group))
		) {
			return left(new ForbiddenError());
		}

		// Create authentication context with runAs group if specified
		let authContext = ctx;
		if (feature.runAs && !ctx.principal.groups.includes(feature.runAs)) {
			authContext = {
				...ctx,
				principal: {
					...ctx.principal,
					groups: [...ctx.principal.groups, feature.runAs],
				},
			};
		}

		const runContext: RunContext = {
			authenticationContext: authContext,
			nodeService: new NodeServiceProxy(this.#nodeService, this.#ragService, authContext),
			logger: Logger.instance(`feature=${feature.uuid}`, `tenant=${authContext.tenant}`),
		};

		const validatedParamsOrErr = this.#validateParameters(feature.parameters, params);
		if (validatedParamsOrErr.isLeft()) {
			return left(validatedParamsOrErr.value);
		}

		const validatedParams = validatedParamsOrErr.value;

		const builtinResult = await this.#runBuiltinFeature<T>(authContext, feature, validatedParams);
		if (builtinResult) {
			return builtinResult;
		}

		try {
			const result = await feature.run(runContext, validatedParams);
			return right(result as T);
		} catch (error) {
			return left(
				(error as AntboxError).errorCode
					? (error as AntboxError)
					: new UnknownError((error as Error).message),
			);
		}
	}

	async #runOnCreate(evt: NodeCreatedEvent) {
		const runCriteria: NodeFilters = [["runOnCreates", "==", true]];

		// Create elevated context for system operations
		const elevatedContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		const actions = await this.#getAutomaticActions(runCriteria, elevatedContext);

		// Build authentication context for action execution
		const actionContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: evt.userEmail,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		for (const feature of actions) {
			await this.#runAutomaticAction(actionContext, feature, evt.payload, "onCreate");
		}
	}

	async #runOnUpdate(evt: NodeUpdatedEvent) {
		const runCriteria: NodeFilters = [["runOnUpdates", "==", true]];

		// Create elevated context for system operations
		const elevatedContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		const actions = await this.#getAutomaticActions(runCriteria, elevatedContext);

		// Build authentication context for action execution
		const actionContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: evt.userEmail,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		const node = await this.#getNodeMetadataForUpdateTrigger(elevatedContext, evt.payload.uuid);
		if (!node) {
			return;
		}

		for (const feature of actions) {
			await this.#runAutomaticAction(actionContext, feature, node, "onUpdate");
		}
	}

	async #runOnDelete(evt: NodeDeletedEvent) {
		const runCriteria: NodeFilters = [["runOnDeletes", "==", true]];

		// Create elevated context for system operations
		const elevatedContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		const actions = await this.#getAutomaticActions(runCriteria, elevatedContext);

		// Build authentication context for action execution
		const actionContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: evt.userEmail,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		for (const feature of actions) {
			await this.#runAutomaticAction(actionContext, feature, evt.payload, "onDelete");
		}
	}

	async #runOnDeleteFolderHooks(evt: NodeDeletedEvent) {
		if (evt.payload.parent === Nodes.ROOT_FOLDER_UUID) {
			return;
		}

		// Create elevated context for system operations
		const elevatedContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		// Get the parent folder
		const folderOrErr = await this.#nodeService.get(elevatedContext, evt.payload.parent);

		if (folderOrErr.isLeft()) {
			return;
		}

		const folder = folderOrErr.value;

		// Check if folder has onDelete actions
		if (
			!Nodes.isFolder(folder as unknown as NodeLike) || !folder.onDelete ||
			folder.onDelete.length === 0
		) {
			return;
		}

		// Build authentication context for action execution
		const actionContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: evt.userEmail,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		// Execute each onDelete action
		for (const actionString of folder.onDelete) {
			const { featureUuid, parameters } = this.#parseActionString(actionString);

			try {
				await this.#runFolderHookAction(
					actionContext,
					featureUuid,
					evt.payload.uuid,
					parameters,
					"onDelete",
				);
			} catch (error) {
				Logger.error(
					`Error running onDelete action ${featureUuid} for node ${evt.payload.uuid}:`,
					error,
				);
			}
		}
	}

	async #runOnCreateFolderHooks(evt: NodeCreatedEvent) {
		if (evt.payload.parent === Nodes.ROOT_FOLDER_UUID) {
			return;
		}

		// Create elevated context for system operations
		const elevatedContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		// Get the parent folder
		const folderOrErr = await this.#nodeService.get(elevatedContext, evt.payload.parent);

		if (folderOrErr.isLeft()) {
			return;
		}

		const folder = folderOrErr.value;

		// Check if folder has onCreate actions
		if (
			!Nodes.isFolder(folder as NodeMetadata) || !folder.onCreate ||
			folder.onCreate.length === 0
		) {
			return;
		}

		// Build authentication context for action execution
		const actionContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: evt.userEmail,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		// Execute each onCreate action
		for (const actionString of folder.onCreate) {
			const { featureUuid, parameters } = this.#parseActionString(actionString);

			// Run the action with action context
			try {
				await this.#runFolderHookAction(
					actionContext,
					featureUuid,
					evt.payload.uuid,
					parameters,
					"onCreate",
				);
			} catch (error) {
				Logger.error(
					`Error running onCreate action ${featureUuid} for node ${evt.payload.uuid}:`,
					error,
				);
			}
		}
	}

	async #runOnUpdatedFolderHooks(evt: NodeUpdatedEvent) {
		// Create elevated context for system operations
		const elevatedContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		const node = await this.#nodeService.get(elevatedContext, evt.payload.uuid);
		if (node.isLeft() || node.value.parent === Nodes.ROOT_FOLDER_UUID) {
			return;
		}

		// Get the parent folder
		const folderOrErr = await this.#nodeService.get(elevatedContext, node.value.parent!);

		if (folderOrErr.isLeft()) {
			return;
		}

		const folder = folderOrErr.value;

		// Check if folder has onUpdate actions
		if (
			!Nodes.isFolder(folder as NodeMetadata) || !folder.onUpdate ||
			folder.onUpdate.length === 0
		) {
			return;
		}

		// Build authentication context for action execution
		const actionContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: evt.userEmail,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		// Execute each onUpdate action
		for (const actionString of folder.onUpdate) {
			const { featureUuid, parameters } = this.#parseActionString(actionString);

			// Run the action with action context
			try {
				await this.#runFolderHookAction(
					actionContext,
					featureUuid,
					evt.payload.uuid,
					parameters,
					"onUpdate",
				);
			} catch (error) {
				Logger.error(
					`Error running onUpdate action ${featureUuid} for node ${evt.payload.uuid}:`,
					error,
				);
			}
		}
	}

	async #runOnEmbeddingsCreated(evt: EmbeddingCreatedEvent) {
		const runCriteria: NodeFilters = [["runOnEmbeddingsCreated", "==", true]];

		const elevatedContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		const actions = await this.#getAutomaticActions(runCriteria, elevatedContext);

		const actionContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: evt.userEmail,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		const nodeOrErr = await this.#nodeService.get(elevatedContext, evt.payload.uuid);
		if (nodeOrErr.isLeft()) {
			Logger.warn(
				`Skipping automatic onEmbeddingsCreated features for node ${evt.payload.uuid}: ${nodeOrErr.value.message}`,
			);
			return;
		}

		for (const feature of actions) {
			await this.#runAutomaticAction(actionContext, feature, nodeOrErr.value, "onCreate");
		}
	}

	async #runOnEmbeddingsUpdated(evt: EmbeddingUpdatedEvent) {
		const runCriteria: NodeFilters = [["runOnEmbeddingsUpdated", "==", true]];

		const elevatedContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: Users.ROOT_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		const actions = await this.#getAutomaticActions(runCriteria, elevatedContext);

		const actionContext: AuthenticationContext = {
			mode: "Action",
			principal: {
				email: evt.userEmail,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant: evt.tenant,
		};

		const nodeOrErr = await this.#nodeService.get(elevatedContext, evt.payload.uuid);
		if (nodeOrErr.isLeft()) {
			Logger.warn(
				`Skipping automatic onEmbeddingsUpdated features for node ${evt.payload.uuid}: ${nodeOrErr.value.message}`,
			);
			return;
		}

		for (const feature of actions) {
			await this.#runAutomaticAction(actionContext, feature, nodeOrErr.value, "onUpdate");
		}
	}

	async #runAutoTagFeature(
		ctx: AuthenticationContext,
		params: Record<string, unknown>,
	): Promise<Either<AntboxError, void>> {
		if (!this.#agentsEngine) {
			return left(new BadRequestError("Agents engine not available"));
		}

		if (!this.#aspectsService) {
			return left(new BadRequestError("Aspects service not available"));
		}

		const uuids = Array.isArray(params.uuids)
			? params.uuids.filter((uuid): uuid is string => typeof uuid === "string")
			: [];

		const aspects = Array.isArray(params.aspects)
			? params.aspects.filter((a): a is string => typeof a === "string")
			: [];

		if (uuids.length === 0) {
			return left(new BadRequestError("Parameter 'uuids' must be a non-empty array"));
		}

		if (aspects.length === 0) {
			return left(new BadRequestError("Parameter 'aspects' must be a non-empty array"));
		}

		for (const uuid of uuids) {
			const contentsOrErr = await this.#nodeService.getEmbeddingContents(ctx, [uuid]);
			if (contentsOrErr.isLeft()) {
				Logger.warn(`Auto-tag: failed to get embedding contents for node ${uuid}, skipping`);
				continue;
			}

			const contentMd = contentsOrErr.value[uuid];
			if (!contentMd) {
				Logger.warn(`Auto-tag: no contentMd available for node ${uuid}, skipping`);
				continue;
			}

			for (const aspectUuid of aspects) {
				const aspectOrErr = await this.#aspectsService.getAspect(ctx, aspectUuid);
				if (aspectOrErr.isLeft()) {
					Logger.warn(
						`Auto-tag: failed to get aspect ${aspectUuid}: ${aspectOrErr.value.message}, skipping`,
					);
					continue;
				}

				const aspect = aspectOrErr.value;
				const prompt = `## Document Content\n\n${contentMd}\n\n## Aspect Definition\n\n${
					JSON.stringify({
						uuid: aspect.uuid,
						title: aspect.title,
						properties: aspect.properties,
					})
				}`;

				const answerOrErr = await this.#agentsEngine.answer(
					ctx,
					ASPECT_FIELD_EXTRACTOR_AGENT_UUID,
					prompt,
				);

				if (answerOrErr.isLeft()) {
					Logger.warn(
						`Auto-tag: agent extraction failed for node ${uuid}, aspect ${aspectUuid}: ${answerOrErr.value.message}`,
					);
					continue;
				}

				let extractedValues: Record<string, unknown>;
				try {
					const responseText = answerOrErr.value.parts
						.map((p) => p.text ?? "")
						.join("");
					const jsonMatch = responseText.match(/\{[\s\S]*\}/);
					extractedValues = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
				} catch {
					Logger.warn(
						`Auto-tag: failed to parse agent response for node ${uuid}, aspect ${aspectUuid}`,
					);
					continue;
				}

				if (Object.keys(extractedValues).length === 0) {
					continue;
				}

				const properties: Record<string, unknown> = {};
				for (const [propName, propValue] of Object.entries(extractedValues)) {
					properties[`${aspectUuid}:${propName}`] = propValue;
				}

				const nodeOrErr = await this.#nodeService.get(ctx, uuid);
				if (nodeOrErr.isLeft()) {
					Logger.warn(
						`Auto-tag: failed to get node ${uuid} for update: ${nodeOrErr.value.message}`,
					);
					continue;
				}

				const existingAspects = nodeOrErr.value.aspects ?? [];
				const newAspects = existingAspects.includes(aspectUuid)
					? existingAspects
					: [...existingAspects, aspectUuid];

				const updateOrErr = await this.#nodeService.update(ctx, uuid, {
					aspects: newAspects,
					properties: { ...nodeOrErr.value.properties, ...properties },
				} as NodeMetadata);

				if (updateOrErr.isLeft()) {
					Logger.warn(
						`Auto-tag: failed to update node ${uuid} with aspect ${aspectUuid}: ${updateOrErr.value.message}`,
					);
				}
			}
		}

		return right(undefined);
	}

	#parseActionString(actionString: string): {
		featureUuid: string;
		parameters: Record<string, string>;
	} {
		const trimmed = actionString.trim();
		const firstSpaceIndex = trimmed.indexOf(" ");

		if (firstSpaceIndex === -1) {
			return {
				featureUuid: trimmed,
				parameters: {},
			};
		}

		const featureUuid = trimmed.substring(0, firstSpaceIndex);
		const paramsString = trimmed.substring(firstSpaceIndex + 1).trim();
		const parameters: Record<string, string> = {};

		const paramRegex = /(\w+)=(?:'([^']*)'|"([^"]*)"|([^\s]+))/g;
		let match;

		while ((match = paramRegex.exec(paramsString)) !== null) {
			const key = match[1];
			const value = match[2] ?? match[3] ?? match[4];
			parameters[key] = value;
		}

		return { featureUuid, parameters };
	}

	#validateParameters(
		parameterDefs: FeatureParameter[] | undefined,
		providedParams: Record<string, unknown>,
	): Either<AntboxError, Record<string, unknown>> {
		if (!parameterDefs || parameterDefs.length === 0) {
			return right(providedParams);
		}

		const normalizedParams: Record<string, unknown> = { ...providedParams };

		for (const parameter of parameterDefs) {
			const hasValue = parameter.name in normalizedParams;
			const rawValue = normalizedParams[parameter.name];

			if (!hasValue || rawValue === undefined || rawValue === null || rawValue === "") {
				if (parameter.defaultValue !== undefined) {
					normalizedParams[parameter.name] = parameter.defaultValue;
					continue;
				}

				if (parameter.required) {
					return left(
						new BadRequestError(`Required parameter '${parameter.name}' is missing`),
					);
				}

				delete normalizedParams[parameter.name];
				continue;
			}

			const valueOrErr = this.#coerceParameterValue(parameter, rawValue);
			if (valueOrErr.isLeft()) {
				return left(valueOrErr.value);
			}

			normalizedParams[parameter.name] = valueOrErr.value;
		}

		return right(normalizedParams);
	}

	#coerceParameterValue(
		parameter: FeatureParameter,
		value: unknown,
	): Either<AntboxError, unknown> {
		switch (parameter.type) {
			case "string":
				return typeof value === "string"
					? right(value)
					: left(new BadRequestError(`Parameter '${parameter.name}' must be a string`));
			case "number": {
				const parsed = typeof value === "number"
					? value
					: typeof value === "string" && value.trim().length > 0
					? Number(value)
					: Number.NaN;
				return Number.isFinite(parsed)
					? right(parsed)
					: left(new BadRequestError(`Parameter '${parameter.name}' must be a number`));
			}
			case "boolean": {
				if (typeof value === "boolean") {
					return right(value);
				}

				if (typeof value === "string") {
					const normalized = value.trim().toLowerCase();
					if (["true", "1", "yes", "y"].includes(normalized)) {
						return right(true);
					}
					if (["false", "0", "no", "n"].includes(normalized)) {
						return right(false);
					}
				}

				return left(new BadRequestError(`Parameter '${parameter.name}' must be a boolean`));
			}
			case "date": {
				if (typeof value !== "string") {
					return left(
						new BadRequestError(`Parameter '${parameter.name}' must be an ISO date string`),
					);
				}

				const parsed = new Date(value);
				return Number.isNaN(parsed.getTime())
					? left(
						new BadRequestError(
							`Parameter '${parameter.name}' must be a valid ISO date string`,
						),
					)
					: right(parsed.toISOString());
			}
			case "object": {
				if (this.#isPlainObject(value)) {
					return right(value);
				}

				if (typeof value === "string") {
					try {
						const parsed = JSON.parse(value);
						return this.#isPlainObject(parsed)
							? right(parsed)
							: left(new BadRequestError(`Parameter '${parameter.name}' must be an object`));
					} catch {
						return left(
							new BadRequestError(`Parameter '${parameter.name}' must be valid JSON object`),
						);
					}
				}

				return left(new BadRequestError(`Parameter '${parameter.name}' must be an object`));
			}
			case "file": {
				if (!(value instanceof File)) {
					return left(new BadRequestError(`Parameter '${parameter.name}' must be a file`));
				}

				if (parameter.contentType && value.type !== parameter.contentType) {
					return left(
						new BadRequestError(
							`Parameter '${parameter.name}' must have content type '${parameter.contentType}'`,
						),
					);
				}

				return right(value);
			}
			case "array":
				return this.#coerceArrayParameterValue(parameter, value);
		}
	}

	#coerceArrayParameterValue(
		parameter: FeatureParameter,
		value: unknown,
	): Either<AntboxError, unknown[]> {
		let values: unknown[];

		if (Array.isArray(value)) {
			values = value;
		} else if (typeof value === "string") {
			try {
				const parsed = JSON.parse(value);
				if (Array.isArray(parsed)) {
					values = parsed;
				} else {
					values = value.split(",").map((entry) => entry.trim()).filter((entry) =>
						entry.length > 0
					);
				}
			} catch {
				values = value.split(",").map((entry) => entry.trim()).filter((entry) =>
					entry.length > 0
				);
			}
		} else {
			return left(new BadRequestError(`Parameter '${parameter.name}' must be an array`));
		}

		const coerced: unknown[] = [];
		for (const item of values) {
			const itemOrErr = this.#coerceArrayItem(parameter, item);
			if (itemOrErr.isLeft()) {
				return left(itemOrErr.value);
			}

			coerced.push(itemOrErr.value);
		}

		return right(coerced);
	}

	#coerceArrayItem(parameter: FeatureParameter, value: unknown): Either<AntboxError, unknown> {
		switch (parameter.arrayType) {
			case "number": {
				const parsed = typeof value === "number"
					? value
					: typeof value === "string" && value.trim().length > 0
					? Number(value)
					: Number.NaN;
				return Number.isFinite(parsed) ? right(parsed) : left(
					new BadRequestError(`Parameter '${parameter.name}' must contain only numbers`),
				);
			}
			case "object": {
				if (this.#isPlainObject(value)) {
					return right(value);
				}

				if (typeof value === "string") {
					try {
						const parsed = JSON.parse(value);
						return this.#isPlainObject(parsed) ? right(parsed) : left(
							new BadRequestError(
								`Parameter '${parameter.name}' must contain only objects`,
							),
						);
					} catch {
						return left(
							new BadRequestError(`Parameter '${parameter.name}' must contain only objects`),
						);
					}
				}

				return left(
					new BadRequestError(`Parameter '${parameter.name}' must contain only objects`),
				);
			}
			case "file": {
				if (!(value instanceof File)) {
					return left(
						new BadRequestError(`Parameter '${parameter.name}' must contain only files`),
					);
				}

				if (parameter.contentType && value.type !== parameter.contentType) {
					return left(
						new BadRequestError(
							`Parameter '${parameter.name}' files must have content type '${parameter.contentType}'`,
						),
					);
				}

				return right(value);
			}
			case "string":
			case undefined:
				return typeof value === "string" ? right(value) : left(
					new BadRequestError(`Parameter '${parameter.name}' must contain only strings`),
				);
		}
	}

	#isPlainObject(value: unknown): value is Record<string, unknown> {
		return typeof value === "object" && value !== null && !Array.isArray(value) &&
			!(value instanceof File);
	}
}
