import type { Feature } from "domain/features/feature.ts";
import { featureToNodeMetadata, fileToFeature } from "domain/features/feature.ts";
import { FeatureNode } from "domain/features/feature_node.ts";
import { FeatureNotFoundError } from "domain/features/feature_not_found_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Node } from "domain/nodes/node.ts";
import { NodeLike } from "domain/node_like.ts";
import type { NodeFilter, NodeFilters } from "domain/nodes/node_filter.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Users } from "domain/users_groups/users.ts";
import { AntboxError, BadRequestError, ForbiddenError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";
import { FeatureDTO, toFeatureDTO } from "application/feature_dto.ts";
import { RunContext } from "domain/features/feature_run_context.ts";
import { BUILTIN_AGENT_TOOLS, builtinFeatures } from "application/builtin_features/index.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { AIModel } from "./ai_model.ts";

type RecordKey = [string, string];
interface RunnableRecord {
	count: number;
	timestamp: number;
}

export class FeatureService {
	static #runnable: Map<RecordKey, RunnableRecord> = new Map();

	constructor(
		private readonly _nodeService: NodeService,
		private readonly authService: UsersGroupsService,
		private readonly ocrModel: AIModel,
	) {
		// Register event handlers for domain-wide triggers
		this._nodeService["context"].bus.subscribe(NodeCreatedEvent.EVENT_ID, {
			handle: (evt: NodeCreatedEvent) => this.#runAutomaticFeaturesForCreates(evt),
		});

		this._nodeService["context"].bus.subscribe(NodeUpdatedEvent.EVENT_ID, {
			handle: (evt: NodeUpdatedEvent) => this.#runAutomaticFeaturesForUpdates(evt),
		});

		this._nodeService["context"].bus.subscribe(NodeDeletedEvent.EVENT_ID, {
			handle: (evt: NodeDeletedEvent) => this.#runAutomaticFeaturesForDeletes(evt),
		});
		this._nodeService["context"].bus.subscribe(NodeCreatedEvent.EVENT_ID, {
			handle: (evt: NodeCreatedEvent) => this.#runOnCreateScripts(evt),
		});

		this._nodeService["context"].bus.subscribe(NodeUpdatedEvent.EVENT_ID, {
			handle: (evt: NodeUpdatedEvent) => this.#runOnUpdatedScripts(evt),
		});

		this._nodeService["context"].bus.subscribe(NodeDeletedEvent.EVENT_ID, {
			handle: (evt: NodeDeletedEvent) => this.#runOnDeleteScripts(evt),
		});
	}

	async createOrReplace(
		ctx: AuthenticationContext,
		file: File,
	): Promise<Either<AntboxError, Node>> {
		const featureOrErr = await fileToFeature(file);

		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		const metadata = featureToNodeMetadata(feature);

		// Validate that runAs group exists if specified
		if (feature.runAs) {
			const groupOrErr = await this.authService.getGroup(
				UsersGroupsService.elevatedContext,
				feature.runAs,
			);
			if (groupOrErr.isLeft()) {
				return left(
					new BadRequestError(
						`runAs group '${feature.runAs}' does not exist`,
					),
				);
			}
		}

		const nodeOrErr = await this._nodeService.get(ctx, feature.uuid);

		if (nodeOrErr.isLeft()) {
			return this._nodeService.createFile(ctx, file, {
				...metadata,
				uuid: feature.uuid,
				parent: Folders.FEATURES_FOLDER_UUID,
			});
		}

		await this._nodeService.updateFile(ctx, feature.uuid, file);

		// Update the node metadata with new action properties
		const updateResult = await this._nodeService.update(
			ctx,
			feature.uuid,
			metadata,
		);
		if (updateResult.isLeft()) {
			return left(updateResult.value);
		}

		const updatedNodeOrErr = await this._nodeService.get(ctx, feature.uuid);

		if (updatedNodeOrErr.isLeft()) {
			return left(updatedNodeOrErr.value);
		}

		return right(updatedNodeOrErr.value);
	}

	async delete(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		const featureOrErr = await this.get(ctx, uuid);

		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		return this._nodeService.delete(ctx, uuid);
	}

	async export(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, File>> {
		const featureOrErr = await this.get(ctx, uuid);

		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		// Get the original file content
		const fileOrErr = await this._nodeService.export(ctx, uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		const originalFile = fileOrErr.value;
		const originalContent = await originalFile.text();

		const exportContent = originalContent;
		const feature = featureOrErr.value;

		// Create a new file with the modified content
		return right(
			new File([exportContent], `${feature.uuid}.js`, {
				type: "application/javascript",
			}),
		);
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError | FeatureNotFoundError, FeatureDTO>> {
		const found = builtinFeatures.find((a) => a.uuid === uuid);

		if (found) {
			const featureNode = FeatureNode.create({
				uuid: found.uuid,
				title: found.name,
				description: found.description,
				mimetype: Nodes.FEATURE_MIMETYPE,
				parent: Folders.FEATURES_FOLDER_UUID,
				exposeAction: found.exposeAction,
				runOnCreates: found.runOnCreates,
				runOnUpdates: found.runOnUpdates,
				runManually: found.runManually,
				filters: found.filters,
				exposeExtension: found.exposeExtension,
				exposeAITool: found.exposeAITool,
				runAs: found.runAs,
				groupsAllowed: found.groupsAllowed,
				parameters: found.parameters,
				returnType: found.returnType,
				returnDescription: found.returnDescription,
				returnContentType: found.returnContentType,
				owner: Users.ROOT_USER_EMAIL,
			})
				.right;
			return right(toFeatureDTO(featureNode));
		}

		const nodeOrErr = await this._nodeService.get(ctx, uuid);

		if (nodeOrErr.isLeft() && nodeOrErr.value instanceof NodeNotFoundError) {
			return left(new FeatureNotFoundError(uuid));
		}

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!Nodes.isFeature(nodeOrErr.value)) {
			return left(new FeatureNotFoundError(uuid));
		}

		return right(toFeatureDTO(nodeOrErr.value as FeatureNode));
	}

	async getAITool(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, FeatureDTO>> {
		const featureOrErr = await this.get(ctx, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeAITool) {
			return left(new BadRequestError("Feature is not exposed as AI tool"));
		}

		return right(feature);
	}

	async getExtension(uuid: string): Promise<Either<AntboxError, FeatureDTO>> {
		const featureOrErr = await this.get(UsersGroupsService.elevatedContext, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeExtension) {
			return left(new BadRequestError("Feature is not exposed as extension"));
		}

		return right(feature);
	}

	async listActions(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, NodeLike[]>> {
		// Get features that are exposed as actions
		const featuresOrErrs = await this._nodeService.find(
			ctx,
			[
				["mimetype", "==", Nodes.FEATURE_MIMETYPE],
				["parent", "==", Folders.FEATURES_FOLDER_UUID],
				["exposeAction", "==", true],
			],
			Number.MAX_SAFE_INTEGER,
		);

		if (featuresOrErrs.isLeft()) {
			return left(featuresOrErrs.value);
		}

		return right(featuresOrErrs.value.nodes);
	}

	async listAITools(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, FeatureDTO[]>> {
		// Get features that are exposed as AI tools
		const featuresOrErrs = await this._nodeService.find(
			ctx,
			[
				["mimetype", "==", Nodes.FEATURE_MIMETYPE],
				["parent", "==", Folders.FEATURES_FOLDER_UUID],
				["exposeAITool", "==", true],
			],
			Number.MAX_SAFE_INTEGER,
		);

		if (featuresOrErrs.isLeft()) {
			return left(featuresOrErrs.value);
		}

		const nodes = [
			...featuresOrErrs.value.nodes.filter(Nodes.isAITool),
			...builtinFeatures.filter((f) => f.exposeAITool),
		].map(toFeatureDTO);

		nodes.push(...(BUILTIN_AGENT_TOOLS as FeatureDTO[]));

		return right(nodes);
	}

	async listExtensions(): Promise<Either<AntboxError, NodeLike[]>> {
		// Get features that are exposed as extensions
		const featuresOrErrs = await this._nodeService.find(
			UsersGroupsService.elevatedContext,
			[
				["mimetype", "==", Nodes.FEATURE_MIMETYPE],
				["parent", "==", Folders.FEATURES_FOLDER_UUID],
				["exposeExtension", "==", true],
			],
			Number.MAX_SAFE_INTEGER,
		);

		if (featuresOrErrs.isLeft()) {
			return left(featuresOrErrs.value);
		}

		return right(featuresOrErrs.value.nodes);
	}

	async listFeatures(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, FeatureDTO[]>> {
		// Get features that are exposed as actions
		const featuresOrErrs = await this._nodeService.find(
			ctx,
			[
				["mimetype", "==", Nodes.FEATURE_MIMETYPE],
				["parent", "==", Folders.FEATURES_FOLDER_UUID],
				["exposeFeature", "==", true],
			],
			Number.MAX_SAFE_INTEGER,
		);

		const actionsOrErrs = await this._nodeService.find(
			ctx,
			[
				["mimetype", "==", Nodes.FEATURE_MIMETYPE],
				["parent", "==", Folders.FEATURES_FOLDER_UUID],
			],
			Number.MAX_SAFE_INTEGER,
		);

		const featureNodes = featuresOrErrs.isRight()
			? featuresOrErrs.value.nodes as FeatureNode[]
			: [];
		const actionNodes = actionsOrErrs.isRight() ? actionsOrErrs.value.nodes as FeatureNode[] : [];

		const builtinFeatureNodes = builtinFeatures
			.map((a) => {
				try {
					const result = FeatureNode.create({
						uuid: a.uuid,
						title: a.name,
						description: a.description,
						mimetype: Nodes.FEATURE_MIMETYPE,
						parent: Folders.FEATURES_FOLDER_UUID,
						exposeAction: a.exposeAction,
						runOnCreates: a.runOnCreates,
						runOnUpdates: a.runOnUpdates,
						runManually: a.runManually,
						filters: a.filters,
						exposeExtension: a.exposeExtension,
						exposeAITool: a.exposeAITool,
						runAs: a.runAs,
						groupsAllowed: a.groupsAllowed,
						parameters: a.parameters,
						returnType: a.returnType,
						returnDescription: a.returnDescription,
						returnContentType: a.returnContentType,
						owner: Users.ROOT_USER_EMAIL,
					});
					return result.isRight() ? result.value : null;
				} catch {
					return null;
				}
			})
			.filter((node): node is FeatureNode => node !== null);

		const allNodes: FeatureNode[] = [
			...featureNodes,
			...actionNodes,
			...builtinFeatureNodes,
		].sort((a, b) => a.title.localeCompare(b.title));

		const dtos = allNodes.map(toFeatureDTO);
		return right(dtos);
	}

	get nodeService(): NodeService {
		return this._nodeService;
	}

	async runAction<T>(
		ctx: AuthenticationContext,
		uuid: string,
		uuids: string[],
		params?: Record<string, unknown>,
	): Promise<Either<AntboxError, T>> {
		// First check if the feature exists and is exposed as action
		const featureOrErr = await this.get(UsersGroupsService.elevatedContext, uuid);
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

		// Filter uuids to can be exposed to action
		const spec = NodesFilters.nodeSpecificationFrom(feature.filters);
		const nodesOrErrs = await Promise.all(uuids.map((uuid) => this._nodeService.get(ctx, uuid)));

		const filterAndLog = (nodeOrErr: Either<AntboxError, NodeLike>) => {
			if (nodeOrErr.isLeft()) {
				console.warn("Error retrieving the node", nodeOrErr.value.message);
			}
			return nodeOrErr.isRight();
		};

		const nodes = nodesOrErrs.filter(filterAndLog)
			.map((n) => n.value)
			.filter((n) => spec.isSatisfiedBy(n as unknown as NodeLike));

		try {
			FeatureService.#incRunnable([uuid, "action"]);
			return await this.#run(ctx, uuid, { ...params, uuids: nodes });
		} catch (error) {
			return left(
				new UnknownError(`Action error: ${(error as Error).message}`),
			);
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
		// Use elevated context first to get the feature metadata
		const featureOrErr = await this.get(UsersGroupsService.elevatedContext, uuid);
		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		if (!feature.exposeAITool) {
			return left(new BadRequestError("Feature is not exposed as AI tool"));
		}

		return this.#run(ctx, uuid, parameters);
	}

	async #runNodeServiceMethodAsTool<T>(
		ctx: AuthenticationContext,
		name: string,
		args: Record<string, unknown>,
	): Promise<Either<AntboxError, T>> {
		// deno-lint-ignore no-explicit-any
		let result: any;
		let fileOrErr: Either<AntboxError, File>;
		try {
			switch (name) {
				case "NodeService:find":
					result = this._nodeService.find(
						ctx,
						args.filters as NodeFilters,
						args.pageSize as number ?? 20,
						args.pageToken as number ?? 1,
					);
					break;
				case "NodeService:get":
					result = this._nodeService.get(ctx, args.uuid as string);
					break;
				case "NodeService:create":
					result = this._nodeService.create(ctx, args.metadata as NodeMetadata);
					break;
				case "NodeService:duplicate":
					result = this._nodeService.duplicate(ctx, args.uuid as string);
					break;
				case "NodeService:copy":
					result = this._nodeService.copy(ctx, args.uuid as string, args.parent as string);
					break;
				case "NodeService:breadcrumbs":
					result = this._nodeService.breadcrumbs(ctx, args.uuid as string);
					break;
				case "NodeService:delete":
					result = this._nodeService.delete(ctx, args.uuid as string);
					break;
				case "NodeService:update":
					result = this._nodeService.update(
						ctx,
						args.uuid as string,
						args.metadata as NodeMetadata,
					);
					break;
				case "OcrModel:ocr":
					fileOrErr = await this._nodeService.export(ctx, args.uuid as string);
					result = this.ocrModel.ocr(fileOrErr.right);
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
		const featureOrErr = await this.get(ctx, uuid);
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

	async #create(
		ctx: AuthenticationContext,
		file: File,
		metadata?: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, FeatureDTO>> {
		const featureOrErr = await fileToFeature(file);

		if (featureOrErr.isLeft()) {
			return left(featureOrErr.value);
		}

		const feature = featureOrErr.value;
		const featureMetadata = featureToNodeMetadata(feature, ctx.principal.email);
		const combinedMetadata = metadata ? { ...featureMetadata, ...metadata } : featureMetadata;

		const nodeOrErr = await this._nodeService.createFile(
			ctx,
			file,
			combinedMetadata as NodeMetadata,
		);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}
		return right(toFeatureDTO(nodeOrErr.value as FeatureNode));
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

	#filterUuidsByFeature(
		ctx: AuthenticationContext,
		action: Feature,
		uuids: string[],
	): Promise<Array<{ uuid: string; passed: boolean }>> {
		const promises = uuids.map(async (uuid) => {
			const nodeOrErr = await this._nodeService.get(ctx, uuid);

			if (nodeOrErr.isLeft()) {
				return { uuid, passed: false };
			}

			const filterOrErr = NodesFilters.satisfiedBy(
				action.filters,
				nodeOrErr.value,
			);

			if (filterOrErr.isLeft()) {
				return { uuid, passed: false };
			}

			return { uuid, passed: filterOrErr.value };
		});

		return Promise.all(promises);
	}

	async #getAutomaticActions(
		criteria: NodeFilter,
	): Promise<Feature[]> {
		// Get builtin actions that match criteria
		const builtinMatches = builtinFeatures.filter((a) => {
			const [key, op, value] = criteria;
			const propertyValue = (a as unknown as Record<string, unknown>)[key];
			return op === "==" ? propertyValue === value : propertyValue !== value;
		});

		// Get action nodes from the repository
		const actionsOrErrs = await this._nodeService.find(
			UsersGroupsService.elevatedContext,
			[
				["mimetype", "==", Nodes.FEATURE_MIMETYPE],
				["parent", "==", Folders.FEATURES_FOLDER_UUID],
				criteria,
			],
			Number.MAX_SAFE_INTEGER,
		);

		if (actionsOrErrs.isLeft()) {
			return builtinMatches;
		}

		const actions = [];
		for (const node of actionsOrErrs.value.nodes) {
			const featureOrErr = await this.#getNodeAsRunnableFeature(
				UsersGroupsService.elevatedContext,
				node.uuid,
			);

			if (featureOrErr.isRight()) {
				actions.push(featureOrErr.value);
			}
		}

		return [...builtinMatches, ...actions];
	}

	async #getNodeAsRunnableFeature(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, Feature>> {
		if (builtinFeatures.some((a) => a.uuid === uuid)) {
			return right(builtinFeatures.find((a) => a.uuid === uuid)!);
		}

		const nodeOrErr = await this._nodeService.get(ctx, uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!Nodes.isFeature(nodeOrErr.value)) {
			return left(new NodeNotFoundError(uuid));
		}

		const fileOrErr = await this._nodeService.export(ctx, uuid);

		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		const module = await import(URL.createObjectURL(fileOrErr.value));

		return right(module.default);
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
		const featureOrErr = await this.#getNodeAsRunnableFeature(
			UsersGroupsService.elevatedContext,
			uuid,
		);

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
			nodeService: this._nodeService,
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

	async #runAutomaticFeaturesForCreates(evt: NodeCreatedEvent) {
		const runCriteria: NodeFilter = ["runOnCreates", "==", true];

		const actions = await this.#getAutomaticActions(runCriteria);

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
				feature.filters,
				evt.payload,
			);

			if (filterOrErr.isLeft()) {
				continue;
			}

			if (!filterOrErr.value) {
				continue;
			}

			const runContext: RunContext = {
				authenticationContext: actionContext,
				nodeService: this._nodeService,
			};

			try {
				await feature.run(runContext, { uuids: [evt.payload.uuid] });
			} catch (error) {
				console.error(`Error running feature ${feature.uuid}:`, error);
			}
		}
	}

	async #runAutomaticFeaturesForUpdates(
		evt: NodeUpdatedEvent,
	) {
		const runCriteria: NodeFilter = ["runOnUpdates", "==", true];

		const actions = await this.#getAutomaticActions(runCriteria);

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
				feature.filters,
				evt.payload as Node,
			);

			if (filterOrErr.isLeft()) {
				continue;
			}

			if (!filterOrErr.value) {
				continue;
			}

			const runContext: RunContext = {
				authenticationContext: actionContext,
				nodeService: this._nodeService,
			};

			try {
				await feature.run(runContext, { uuids: [evt.payload.uuid] });
			} catch (error) {
				console.error(`Error running feature ${feature.uuid}:`, error);
			}
		}
	}

	async #runAutomaticFeaturesForDeletes(evt: NodeDeletedEvent) {
		const runCriteria: NodeFilter = ["runOnDeletes", "==", true];

		const actions = await this.#getAutomaticActions(runCriteria);

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
				feature.filters,
				evt.payload,
			);

			if (filterOrErr.isLeft()) {
				continue;
			}

			if (!filterOrErr.value) {
				continue;
			}

			const runContext: RunContext = {
				authenticationContext: actionContext,
				nodeService: this._nodeService,
			};

			try {
				await feature.run(runContext, { uuids: [evt.payload.uuid] });
			} catch (error) {
				console.error(`Error running feature ${feature.uuid}:`, error);
			}
		}
	}

	async #runOnDeleteScripts(evt: NodeDeletedEvent) {
		if (evt.payload.parent === Folders.ROOT_FOLDER_UUID) {
			return;
		}

		// Get the parent folder
		const folderOrErr = await this._nodeService.get(
			UsersGroupsService.elevatedContext,
			evt.payload.parent,
		);

		if (folderOrErr.isLeft()) {
			return;
		}

		const folder = folderOrErr.value;

		// Check if folder has onDelete actions
		if (!Nodes.isFolder(folder) || !folder.onDelete || folder.onDelete.length === 0) {
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

	async #runOnCreateScripts(evt: NodeCreatedEvent) {
		if (evt.payload.parent === Folders.ROOT_FOLDER_UUID) {
			return;
		}

		// Get the parent folder
		const folderOrErr = await this._nodeService.get(
			UsersGroupsService.elevatedContext,
			evt.payload.parent,
		);

		if (folderOrErr.isLeft()) {
			return;
		}

		const folder = folderOrErr.value;

		// Check if folder has onCreate actions
		if (!Nodes.isFolder(folder) || !folder.onCreate || folder.onCreate.length === 0) {
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
				await this.#run(
					actionContext,
					featureUuid,
					params,
				);
			} catch (error) {
				console.error(
					`Error running onCreate action ${featureUuid} for node ${evt.payload.uuid}:`,
					error,
				);
			}
		}
	}

	async #runOnUpdatedScripts(
		evt: NodeUpdatedEvent,
	) {
		const node = await this._nodeService.get(
			UsersGroupsService.elevatedContext,
			evt.payload.uuid,
		);
		if (node.isLeft() || node.value.parent === Folders.ROOT_FOLDER_UUID) {
			return;
		}

		// Get the parent folder
		const folderOrErr = await this._nodeService.get(
			UsersGroupsService.elevatedContext,
			node.value.parent,
		);

		if (folderOrErr.isLeft()) {
			return;
		}

		const folder = folderOrErr.value;

		// Check if folder has onUpdate actions
		if (!Nodes.isFolder(folder) || !folder.onUpdate || folder.onUpdate.length === 0) {
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
				await this.#run(
					actionContext,
					featureUuid,
					params,
				);
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
}
