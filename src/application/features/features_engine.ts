import { Logger } from "shared/logger.ts";
import { kebabToCamelCase } from "shared/string_utils.ts";
import type { FeatureData } from "domain/configuration/feature_data.ts";
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
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { AntboxError, BadRequestError, ForbiddenError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { EventBus } from "shared/event_bus.ts";
import type { OCRProvider } from "domain/ai/ocr_provider.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { NodeService } from "../nodes/node_service.ts";
import { NodeServiceProxy } from "../nodes/node_service_proxy.ts";
import type { FeaturesService } from "./features_service.ts";
import { RAGService } from "../ai/rag_service.ts";
import { validateFeatureParameters } from "./feature_parameters.ts";
import { runSystemAITool } from "./system_ai_tools.ts";
import { runFeatureExtension } from "./feature_extension.ts";
import { type AgentAnswerExecutor, runBuiltinFeature } from "./builtin_feature_executor.ts";

export type { AgentAnswerExecutor } from "./builtin_feature_executor.ts";

const MAX_RUNNABLE_DEPTH = 3;

type AutomaticRunFlag =
	| "runOnCreates"
	| "runOnUpdates"
	| "runOnDeletes"
	| "runOnEmbeddingsCreated"
	| "runOnEmbeddingsUpdated";
type AutomaticTriggerName =
	| "onCreate"
	| "onUpdate"
	| "onDelete"
	| "onEmbeddingsCreated"
	| "onEmbeddingsUpdated";
type FolderHookName = "onCreate" | "onUpdate" | "onDelete";

export interface FeaturesEngineContext {
	featuresService: FeaturesService;
	nodeService: NodeService;
	agentsEngine?: AgentAnswerExecutor;
	aspectsService?: AspectsService;
	ocrProvider?: OCRProvider;
	ragService?: RAGService;
	eventBus: EventBus;
}

/** Executes features as actions, AI tools, extensions, and event handlers. */
export class FeaturesEngine {
	readonly #actionDepth = new Map<string, number>();

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

	/** Runs an action after exposure, mode, permission, and node-filter checks. */
	async runAction<T>(
		ctx: AuthenticationContext,
		uuid: string,
		uuids: string[],
		params?: Record<string, unknown>,
	): Promise<Either<AntboxError, T>> {
		// First check if the feature exists and is exposed as action.
		// Builtin features use snake_case UUIDs; custom features use camelCase UUIDs.
		// Try the provided UUID first, then fall back to camelCase only when it was not found.
		const featureOrErr = await this.#getActionFeatureWithUuidFallback(ctx, uuid);
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

		const nodesOrErrs = await Promise.all(uuids.map((uuid) => this.#nodeService.get(ctx, uuid)));
		const nodes = nodesOrErrs
			.filter((nodeOrErr) => {
				if (nodeOrErr.isLeft()) {
					Logger.warn("Error retrieving the node", nodeOrErr.value.message);
				}
				return nodeOrErr.isRight();
			})
			.map((nodeOrErr) => nodeOrErr.value);

		return this.#executeAction(ctx, feature, nodes, params);
	}

	async #executeAction<T>(
		ctx: AuthenticationContext,
		feature: FeatureData,
		nodes: NodeMetadata[],
		params?: Record<string, unknown>,
	): Promise<Either<AntboxError, T>> {
		const uuids = nodes
			.filter((node) =>
				NodesFilters.satisfiedBy(feature.filters || [], node as NodeLike).isRight()
			)
			.map((node) => node.uuid!);

		try {
			this.#incrementActionDepth(feature.uuid);
			return await this.#run(ctx, feature.uuid, { ...params, uuids });
		} catch (error) {
			return left(new UnknownError(`Action error: ${(error as Error).message}`));
		} finally {
			this.#decrementActionDepth(feature.uuid);
		}
	}

	async #getActionFeatureWithUuidFallback(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>> {
		const featureOrErr = await this.#featuresService.getFeature(ctx, uuid);
		if (featureOrErr.isRight()) {
			return featureOrErr;
		}

		const camelCaseUuid = kebabToCamelCase(uuid);
		if (camelCaseUuid === uuid || !this.#isFeatureNotFoundError(featureOrErr.value, uuid)) {
			return featureOrErr;
		}

		return this.#featuresService.getFeature(ctx, camelCaseUuid);
	}

	#isFeatureNotFoundError(error: AntboxError, uuid: string): boolean {
		return error instanceof BadRequestError &&
			error.message === `features with uuid '${uuid}' not found`;
	}

	async runAITool<T>(
		ctx: AuthenticationContext,
		uuid: string,
		parameters: Record<string, unknown>,
	): Promise<Either<AntboxError, T>> {
		if (uuid.includes(":")) {
			return runSystemAITool(ctx, uuid, parameters, {
				nodeService: this.#nodeService,
				ocrProvider: this.#ocrProvider,
			});
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

	runExtension(
		ctx: AuthenticationContext,
		uuid: string,
		request: Request,
	): Promise<Response> {
		return runFeatureExtension(ctx, uuid, request, {
			getFeature: (authContext, featureUuid) =>
				this.#featuresService.getFeature(authContext, featureUuid),
			execute: (params) => this.#run(ctx, uuid, params),
		});
	}

	#decrementActionDepth(featureUuid: string): void {
		const depth = this.#actionDepth.get(featureUuid) ?? 0;
		if (depth > 1) {
			this.#actionDepth.set(featureUuid, depth - 1);
		} else {
			this.#actionDepth.delete(featureUuid);
		}
	}

	#incrementActionDepth(featureUuid: string): void {
		this.#actionDepth.set(featureUuid, (this.#actionDepth.get(featureUuid) ?? 0) + 1);
	}

	async #getAutomaticActions(
		criteria: NodeFilters,
		ctx: AuthenticationContext,
	): Promise<FeatureData[]> {
		const actionsOrErr = await this.#featuresService.listActions(ctx);
		if (actionsOrErr.isLeft()) {
			return [];
		}

		return actionsOrErr.value.filter((action) => {
			const matchesOrErr = NodesFilters.satisfiedBy(
				criteria,
				action as unknown as NodeLike,
			);
			return matchesOrErr.isRight() && matchesOrErr.value;
		});
	}

	async #runFolderHookAction(
		ctx: AuthenticationContext,
		featureUuid: string,
		node: NodeMetadata,
		parameters: Record<string, string>,
		hookName: FolderHookName,
	): Promise<void> {
		const featureOrErr = await this.#getActionFeatureWithUuidFallback(ctx, featureUuid);
		if (featureOrErr.isLeft()) {
			Logger.warn(
				`Skipping folder ${hookName} feature ${featureUuid}: ${featureOrErr.value.message}`,
			);
			return;
		}

		const feature = featureOrErr.value;
		if (!feature.exposeAction) {
			Logger.warn(`Skipping folder ${hookName} feature ${featureUuid}: not exposed as action`);
			return;
		}

		if ((this.#actionDepth.get(feature.uuid) ?? 0) > MAX_RUNNABLE_DEPTH) {
			Logger.warn(
				`Skipping folder ${hookName} feature ${feature.uuid}: max runnable depth (${MAX_RUNNABLE_DEPTH}) exceeded`,
			);
			return;
		}

		const result = await this.#executeAction(ctx, feature, [node], parameters);
		if (result.isLeft()) {
			Logger.warn(
				`Skipping folder ${hookName} feature ${featureUuid} for node ${node.uuid}: ${result.value.message}`,
			);
		}
	}

	async #runAutomaticAction(
		ctx: AuthenticationContext,
		feature: FeatureData,
		node: NodeMetadata,
		triggerName: AutomaticTriggerName,
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

		if ((this.#actionDepth.get(feature.uuid) ?? 0) > MAX_RUNNABLE_DEPTH) {
			Logger.warn(
				`Skipping automatic ${triggerName} feature ${feature.uuid}: max runnable depth (${MAX_RUNNABLE_DEPTH}) exceeded`,
			);
			return;
		}

		try {
			this.#incrementActionDepth(feature.uuid);
			const result = await this.#run(ctx, feature.uuid, { uuids: [node.uuid] });
			if (result.isLeft()) {
				Logger.warn(
					`Skipping automatic ${triggerName} feature ${feature.uuid} for node ${node.uuid}: ${result.value.message}`,
				);
			}
		} finally {
			this.#decrementActionDepth(feature.uuid);
		}
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

		const validatedParamsOrErr = validateFeatureParameters(feature.parameters, params);
		if (validatedParamsOrErr.isLeft()) {
			return left(validatedParamsOrErr.value);
		}

		const validatedParams = validatedParamsOrErr.value;

		const builtinResult = await runBuiltinFeature<T>(
			{
				nodeService: this.#nodeService,
				agentsEngine: this.#agentsEngine,
				aspectsService: this.#aspectsService,
			},
			authContext,
			feature.uuid,
			validatedParams,
		);
		if (builtinResult) {
			return builtinResult;
		}

		try {
			const result = await feature.run(runContext, validatedParams);
			return right(result as T);
		} catch (error) {
			return left(
				error instanceof AntboxError
					? error
					: new UnknownError(error instanceof Error ? error.message : String(error)),
			);
		}
	}

	#actionContext(tenant: string, userEmail: string): AuthenticationContext {
		return {
			mode: "Action",
			principal: {
				email: userEmail,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			tenant,
		};
	}

	async #runAutomaticActions(
		tenant: string,
		userEmail: string,
		node: NodeMetadata,
		runFlag: AutomaticRunFlag,
		triggerName: AutomaticTriggerName,
	): Promise<void> {
		const elevatedContext = this.#actionContext(tenant, Users.ROOT_USER_EMAIL);
		const runCriteria: NodeFilters = [[runFlag, "==", true]];
		const actions = await this.#getAutomaticActions(runCriteria, elevatedContext);
		const actionContext = this.#actionContext(tenant, userEmail);

		for (const feature of actions) {
			await this.#runAutomaticAction(actionContext, feature, node, triggerName);
		}
	}

	async #runStoredNodeAutomaticActions(
		tenant: string,
		userEmail: string,
		uuid: string,
		runFlag: AutomaticRunFlag,
		triggerName: AutomaticTriggerName,
	): Promise<void> {
		const nodeOrErr = await this.#nodeService.get(
			this.#actionContext(tenant, Users.ROOT_USER_EMAIL),
			uuid,
		);
		if (nodeOrErr.isLeft()) {
			Logger.warn(
				`Skipping automatic ${triggerName} features for node ${uuid}: ${nodeOrErr.value.message}`,
			);
			return;
		}

		await this.#runAutomaticActions(
			tenant,
			userEmail,
			nodeOrErr.value,
			runFlag,
			triggerName,
		);
	}

	async #runOnCreate(evt: NodeCreatedEvent): Promise<void> {
		await this.#runAutomaticActions(
			evt.tenant,
			evt.userEmail,
			evt.payload,
			"runOnCreates",
			"onCreate",
		);
	}

	async #runOnUpdate(evt: NodeUpdatedEvent): Promise<void> {
		await this.#runStoredNodeAutomaticActions(
			evt.tenant,
			evt.userEmail,
			evt.payload.uuid,
			"runOnUpdates",
			"onUpdate",
		);
	}

	async #runOnDelete(evt: NodeDeletedEvent): Promise<void> {
		await this.#runAutomaticActions(
			evt.tenant,
			evt.userEmail,
			evt.payload,
			"runOnDeletes",
			"onDelete",
		);
	}

	async #runFolderHooks(
		tenant: string,
		userEmail: string,
		node: NodeMetadata,
		hookName: FolderHookName,
	): Promise<void> {
		if (node.parent === Nodes.ROOT_FOLDER_UUID) {
			return;
		}

		const elevatedContext = this.#actionContext(tenant, Users.ROOT_USER_EMAIL);
		const folderOrErr = await this.#nodeService.get(elevatedContext, node.parent);
		if (folderOrErr.isLeft() || !Nodes.isFolder(folderOrErr.value as NodeLike)) {
			return;
		}

		const actionStrings = folderOrErr.value[hookName];
		if (!actionStrings?.length) {
			return;
		}

		const actionContext = this.#actionContext(tenant, userEmail);
		for (const actionString of actionStrings) {
			const { featureUuid, parameters } = this.#parseActionString(actionString);
			try {
				await this.#runFolderHookAction(
					actionContext,
					featureUuid,
					node,
					parameters,
					hookName,
				);
			} catch (error) {
				Logger.error(
					`Error running ${hookName} action ${featureUuid} for node ${node.uuid}:`,
					error,
				);
			}
		}
	}

	async #runOnDeleteFolderHooks(evt: NodeDeletedEvent): Promise<void> {
		await this.#runFolderHooks(evt.tenant, evt.userEmail, evt.payload, "onDelete");
	}

	async #runOnCreateFolderHooks(evt: NodeCreatedEvent): Promise<void> {
		await this.#runFolderHooks(evt.tenant, evt.userEmail, evt.payload, "onCreate");
	}

	async #runOnUpdatedFolderHooks(evt: NodeUpdatedEvent): Promise<void> {
		const nodeOrErr = await this.#nodeService.get(
			this.#actionContext(evt.tenant, Users.ROOT_USER_EMAIL),
			evt.payload.uuid,
		);
		if (nodeOrErr.isLeft()) {
			return;
		}

		await this.#runFolderHooks(evt.tenant, evt.userEmail, nodeOrErr.value, "onUpdate");
	}

	async #runOnEmbeddingsCreated(evt: EmbeddingCreatedEvent): Promise<void> {
		await this.#runStoredNodeAutomaticActions(
			evt.tenant,
			evt.userEmail,
			evt.payload.uuid,
			"runOnEmbeddingsCreated",
			"onEmbeddingsCreated",
		);
	}

	async #runOnEmbeddingsUpdated(evt: EmbeddingUpdatedEvent): Promise<void> {
		await this.#runStoredNodeAutomaticActions(
			evt.tenant,
			evt.userEmail,
			evt.payload.uuid,
			"runOnEmbeddingsUpdated",
			"onEmbeddingsUpdated",
		);
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
}
