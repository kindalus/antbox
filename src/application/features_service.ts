// deno-lint-ignore-file no-case-declarations
import { loadTemplate, TEMPLATES } from "api/templates/index.ts";
import { BUILTIN_FEATURES } from "domain/configuration/builtin_features.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { FeatureData } from "domain/configuration/feature_data.ts";
import { FeatureDataSchema } from "domain/configuration/feature_schema.ts";
import type { Feature } from "domain/features/feature.ts";
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
import { UuidGenerator } from "shared/uuid_generator.ts";
import { ValidationError } from "shared/validation_error.ts";
import { DOCS, loadDoc } from "../../docs/index.ts";
import { AIModel } from "./ai_model.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceProxy } from "./node_service_proxy.ts";

type RecordKey = [string, string];
interface RunnableRecord {
	count: number;
	timestamp: number;
}

interface FeaturesServiceContext {
	configRepo: ConfigurationRepository;
	nodeService: NodeService;
	ocrModel?: AIModel;
	eventBus: EventBus;
}

/**
 * FeaturesService - Manages feature configurations and executes feature code
 *
 * Features are mutable configurations that define custom functionality and actions.
 * Features include both metadata and executable code stored as a module string.
 *
 * Access control:
 * - Create/Delete: Admin-only
 * - Update: Admin-only (features can be modified)
 * - Read: Public (all users can view features)
 * - Execute: Based on feature's groupsAllowed configuration
 */
export class FeaturesService {
	static #runnable: Map<RecordKey, RunnableRecord> = new Map();

	readonly #configRepo: ConfigurationRepository;
	readonly #nodeService: NodeService;
	readonly #ocrModel?: AIModel;

	constructor(ctx: FeaturesServiceContext) {
		this.#configRepo = ctx.configRepo;
		this.#nodeService = ctx.nodeService;
		this.#ocrModel = ctx.ocrModel;

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

	// ===== CRUD OPERATIONS =====

	async createFeature(
		ctx: AuthenticationContext,
		data: Omit<FeatureData, "uuid" | "createdTime" | "modifiedTime">,
	): Promise<Either<AntboxError, FeatureData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can create features"));
		}

		const now = new Date().toISOString();
		const featureData: FeatureData = {
			uuid: UuidGenerator.generate(),
			...data,
			createdTime: now,
			modifiedTime: now,
		};

		// Validate with Zod schema
		const validation = FeatureDataSchema.safeParse(featureData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.#configRepo.save("features", featureData);
	}

	async getFeature(
		_ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>> {
		// Check builtin features first
		const builtinFeature = BUILTIN_FEATURES.find((f) => f.uuid === uuid);
		if (builtinFeature) {
			return right(builtinFeature);
		}

		return this.#configRepo.get("features", uuid);
	}

	async listFeatures(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, FeatureData[]>> {
		const customFeaturesOrErr = await this.#configRepo.list("features");

		if (customFeaturesOrErr.isLeft()) {
			return customFeaturesOrErr;
		}

		// Combine builtin features with custom features
		const allFeatures = [...BUILTIN_FEATURES, ...customFeaturesOrErr.value];

		// Sort by title
		allFeatures.sort((a, b) => a.title.localeCompare(b.title));

		// Filter by allowed groups if not admin
		if (
			ctx.principal.email === Users.ROOT_USER_EMAIL ||
			ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
		) {
			return right(allFeatures);
		}

		return right(allFeatures.filter((f) => {
			if (!f.groupsAllowed?.length) {
				return true;
			}

			return f.groupsAllowed.some((g) => ctx.principal.groups.includes(g));
		}));
	}

	async updateFeature(
		ctx: AuthenticationContext,
		uuid: string,
		updates: Partial<Omit<FeatureData, "uuid" | "createdTime">>,
	): Promise<Either<AntboxError, FeatureData>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can update features"));
		}

		// Cannot update builtin features
		if (BUILTIN_FEATURES.some((f) => f.uuid === uuid)) {
			return left(new BadRequestError("Cannot update builtin features"));
		}

		const existingOrErr = await this.#configRepo.get("features", uuid);
		if (existingOrErr.isLeft()) {
			return existingOrErr;
		}

		const updatedData: FeatureData = {
			...existingOrErr.value,
			...updates,
			uuid, // Ensure UUID doesn't change
			createdTime: existingOrErr.value.createdTime, // Preserve creation time
			modifiedTime: new Date().toISOString(),
		};

		// Validate with Zod schema
		const validation = FeatureDataSchema.safeParse(updatedData);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return left(ValidationError.from(...errors));
		}

		return this.#configRepo.save("features", updatedData);
	}

	async deleteFeature(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		// Check admin permission
		if (!this.#isAdmin(ctx)) {
			return left(new ForbiddenError("Only admins can delete features"));
		}

		// Cannot delete builtin features
		if (BUILTIN_FEATURES.some((f) => f.uuid === uuid)) {
			return left(new BadRequestError("Cannot delete builtin features"));
		}

		return this.#configRepo.delete("features", uuid);
	}

	// ===== LISTING BY TYPE =====

	async listActions(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, FeatureData[]>> {
		const featuresOrErr = await this.listFeatures(ctx);
		if (featuresOrErr.isLeft()) {
			return featuresOrErr;
		}

		return right(featuresOrErr.value.filter((f) => f.exposeAction));
	}

	async listAITools(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, FeatureData[]>> {
		const featuresOrErr = await this.listFeatures(ctx);
		if (featuresOrErr.isLeft()) {
			return featuresOrErr;
		}

		return right(featuresOrErr.value.filter((f) => f.exposeAITool));
	}

	async listExtensions(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, Partial<FeatureData>[]>> {
		const featuresOrErr = await this.listFeatures(ctx);
		if (featuresOrErr.isLeft()) {
			return featuresOrErr;
		}

		return right(featuresOrErr.value.filter((f) => f.exposeExtension));
	}

	async getAction(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>> {
		const featureOrErr = await this.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeAction) {
			return left(new BadRequestError("Feature is not exposed as action"));
		}

		return right(feature);
	}

	async getAITool(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>> {
		const featureOrErr = await this.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeAITool) {
			return left(new BadRequestError("Feature is not exposed as AI tool"));
		}

		return right(feature);
	}

	async getExtension(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureData>> {
		const featureOrErr = await this.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeExtension) {
			return left(new BadRequestError("Feature is not exposed as extension"));
		}

		return right(feature);
	}

	// ===== EXECUTION METHODS =====

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
	 * const result = await featuresService.runAction(
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
		const featureOrErr = await this.getFeature(ctx, uuid);
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
				console.warn("Error retrieving the node", nodeOrErr.value.message);
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
			FeaturesService.#incRunnable([uuid, "action"]);
			return await this.#run(ctx, uuid, { ...params, uuids: nodes });
		} catch (error) {
			return left(
				new UnknownError(`Action error: ${(error as Error).message}`),
			);
		} finally {
			FeaturesService.#decRunnable([uuid, "action"]);
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
		const featureOrErr = await this.getFeature(ctx, uuid);
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
					if (!this.#ocrModel) {
						return left(new UnknownError("OCR model not initialized"));
					}
					fileOrErr = await this.#nodeService.export(ctx, args.uuid as string);
					result = this.#ocrModel.ocr(fileOrErr.right);
					break;
				case "Templates:list":
					result = right(TEMPLATES);
					break;
				case "Templates:get":
					const template = await loadTemplate(args.uuid as string);
					if (!template) {
						return left(new NodeNotFoundError(`Template '${args.uuid}' not found`));
					}
					result = right(template.content);
					break;
				case "Docs:list":
					result = right(DOCS);
					break;
				case "Docs:get":
					const doc = await loadDoc(args.uuid as string);
					if (!doc) {
						return left(new NodeNotFoundError(`Documentation '${args.uuid}' not found`));
					}
					result = right(doc.content);
					break;
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
		const featureOrErr = await this.getFeature(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return new Response(featureOrErr.value.message, { status: 404 });
		}

		const feature = featureOrErr.value;
		if (!feature.exposeExtension) {
			return new Response("Feature is not exposed as extension", { status: 400 });
		}

		const paramsOrErr = await this.#extractParametersFromRequest(request);
		if (paramsOrErr.isLeft()) {
			return new Response(paramsOrErr.value.message, { status: 400 });
		}

		const resultOrErr = await this.#run(ctx, uuid, paramsOrErr.value);
		if (resultOrErr.isLeft()) {
			let errCode = 500;

			if (resultOrErr.value instanceof ValidationError) {
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

	get nodeService(): NodeService {
		return this.#nodeService;
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
			this.#runnable.set(key, { count: 1, timestamp: Date.now() });
		}

		return this.#runnable.get(key)!;
	}

	static #incRunnable(key: RecordKey) {
		const runnable = this.#getRunnable(key);
		this.#runnable.set(key, {
			count: runnable?.count ?? 0 + 1,
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
		const actionsOrErr = await this.listActions(ctx);

		if (actionsOrErr.isLeft()) {
			return [];
		}

		const runnables = actionsOrErr.value
			.filter((a) => NodesFilters.satisfiedBy(criteria, a as unknown as NodeLike).isRight())
			.map((a) => this.#getFeatureAsRunnableFeature(ctx, a.uuid));

		const featuresOrErrs = await Promise.all(runnables);

		featuresOrErrs.filter((v) => v.isLeft())
			.forEach((v) => {
				console.warn(v.value.message);
			});

		return featuresOrErrs.filter((v) => v.isRight()).map((v) => v.value);
	}

	async #getFeatureAsRunnableFeature(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, Feature>> {
		const featureDataOrErr = await this.getFeature(ctx, uuid);

		if (featureDataOrErr.isLeft()) {
			return left(featureDataOrErr.value);
		}

		const featureData = featureDataOrErr.value;

		// Create a blob from the module string and import it
		if (!featureData.module) {
			return left(new BadRequestError(`Feature ${uuid} has no executable code`));
		}

		const blob = new Blob([featureData.module], { type: "application/javascript" });
		const moduleUrl = URL.createObjectURL(blob);

		try {
			const module = await import(moduleUrl);
			return right(module.default);
		} finally {
			URL.revokeObjectURL(moduleUrl);
		}
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
			nodeService: new NodeServiceProxy(this.#nodeService, authContext),
		};

		// Validate parameters
		const validationErr = this.#validateParameters(feature.parameters, params);

		if (validationErr) {
			return left(validationErr);
		}

		try {
			const result = await feature.run(runContext, params);
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
			const filterOrErr = NodesFilters.satisfiedBy(
				feature.filters || [],
				evt.payload as unknown as NodeLike,
			);

			if (filterOrErr.isLeft()) {
				continue;
			}

			if (!filterOrErr.value) {
				continue;
			}

			const runContext: RunContext = {
				authenticationContext: actionContext,
				nodeService: new NodeServiceProxy(this.#nodeService, actionContext),
			};

			try {
				await feature.run(runContext, { uuids: [evt.payload.uuid] });
			} catch (error) {
				console.error(`Error running feature ${feature.uuid}:`, error);
			}
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

		for (const feature of actions) {
			const filterOrErr = NodesFilters.satisfiedBy(
				feature.filters || [],
				evt.payload as unknown as NodeLike,
			);

			if (filterOrErr.isLeft()) {
				continue;
			}

			if (!filterOrErr.value) {
				continue;
			}

			const runContext: RunContext = {
				authenticationContext: actionContext,
				nodeService: new NodeServiceProxy(this.#nodeService, actionContext),
			};

			try {
				await feature.run(runContext, { uuids: [evt.payload.uuid] });
			} catch (error) {
				console.error(`Error running feature ${feature.uuid}:`, error);
			}
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
			const filterOrErr = NodesFilters.satisfiedBy(
				feature.filters || [],
				evt.payload as unknown as NodeLike,
			);

			if (filterOrErr.isLeft()) {
				continue;
			}

			if (!filterOrErr.value) {
				continue;
			}

			const runContext: RunContext = {
				authenticationContext: actionContext,
				nodeService: new NodeServiceProxy(this.#nodeService, actionContext),
			};

			try {
				await feature.run(runContext, { uuids: [evt.payload.uuid] });
			} catch (error) {
				console.error(`Error running feature ${feature.uuid}:`, error);
			}
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

			const params: Record<string, unknown> = {
				uuids: [evt.payload.uuid],
				...parameters,
			};

			try {
				await this.#run(actionContext, featureUuid, params);
			} catch (error) {
				console.error(
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

			// Build parameters with uuids and additional parameters
			const params: Record<string, unknown> = {
				uuids: [evt.payload.uuid],
				...parameters,
			};

			// Run the action with action context
			try {
				await this.#run(actionContext, featureUuid, params);
			} catch (error) {
				console.error(
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

			// Build parameters with uuids and additional parameters
			const params: Record<string, unknown> = {
				uuids: [evt.payload.uuid],
				...parameters,
			};

			// Run the action with action context
			try {
				await this.#run(actionContext, featureUuid, params);
			} catch (error) {
				console.error(
					`Error running onUpdate action ${featureUuid} for node ${evt.payload.uuid}:`,
					error,
				);
			}
		}
	}

	#parseActionString(actionString: string): {
		featureUuid: string;
		parameters: Record<string, string>;
	} {
		const parts = actionString.trim().split(/\s+/);
		const featureUuid = parts[0];
		const parameters: Record<string, string> = {};

		// Parse key=value parameters
		for (let i = 1; i < parts.length; i++) {
			const paramPart = parts[i];
			const equalIndex = paramPart.indexOf("=");

			if (equalIndex > 0) {
				const key = paramPart.substring(0, equalIndex);
				const value = paramPart.substring(equalIndex + 1);
				parameters[key] = value;
			}
		}

		return { featureUuid, parameters };
	}

	#validateParameters(
		parameterDefs:
			| Array<{ name: string; type: string; required?: boolean }>
			| undefined,
		providedParams: Record<string, unknown>,
	): AntboxError | null {
		if (!parameterDefs) {
			return null;
		}
		for (const paramDef of parameterDefs) {
			if (paramDef.required && !(paramDef.name in providedParams)) {
				return new BadRequestError(
					`Required parameter '${paramDef.name}' is missing`,
				);
			}
		}
		return null;
	}

	#isAdmin(ctx: AuthenticationContext): boolean {
		return ctx.principal.groups.includes(ADMINS_GROUP_UUID);
	}
}
