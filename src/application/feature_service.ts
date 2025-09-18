import type { Feature } from "domain/features/feature.ts";
import {
  featureToNodeMetadata,
  fileToFeature,
} from "domain/features/feature.ts";
import {
  type Action,
  actionToNodeMetadata,
  fileToAction,
} from "domain/features/action.ts";
import { FeatureNode } from "domain/features/feature_node.ts";
import { FeatureNotFoundError } from "domain/features/feature_not_found_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Node } from "domain/nodes/node.ts";
import { NodeLike } from "domain/node_like.ts";
import type { NodeFilter } from "domain/nodes/node_filter.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Users } from "domain/users_groups/users.ts";
import {
  AntboxError,
  BadRequestError,
  UnknownError,
} from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";
import { FeatureDTO } from "application/feature_dto.ts";
import { RunContext } from "domain/features/feature_run_context.ts";
import { builtinActions } from "application/builtin_actions/index.ts";

type RecordKey = [string, string];
interface RunnableRecord {
  count: number;
  timestamp: number;
}

export type ExtFn = (
  request: Request,
  service: NodeService,
) => Promise<Response>;

export class FeatureService {
  static #runnable: Map<RecordKey, RunnableRecord> = new Map();

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

  constructor(
    private readonly _nodeService: NodeService,
    private readonly authService: UsersGroupsService,
  ) {}

  get nodeService(): NodeService {
    return this._nodeService;
  }

  // === FEATURE METHODS ===

  async getFeature(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError | FeatureNotFoundError, FeatureDTO>> {
    const nodeOrErr = await this._nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isFeature(nodeOrErr.value)) {
      return left(new FeatureNotFoundError(uuid));
    }

    const feature = nodeOrErr.value;
    return right(this.#nodeToFeatureDTO(feature));
  }

  async listFeatures(
    ctx: AuthenticationContext,
  ): Promise<Either<AntboxError, FeatureDTO[]>> {
    const nodesOrErrs = await this._nodeService.find(
      ctx,
      [
        ["mimetype", "==", Nodes.FEATURE_MIMETYPE],
        ["parent", "==", Folders.FEATURES_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      return left(nodesOrErrs.value);
    }

    const nodes = nodesOrErrs.value.nodes as FeatureNode[];
    const dtos = nodes.map((n) => this.#nodeToFeatureDTO(n));

    return right(dtos);
  }

  async createFeature(
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
    const combinedMetadata = metadata
      ? { ...featureMetadata, ...metadata }
      : featureMetadata;

    const nodeOrErr = await this._nodeService.createFile(
      ctx,
      file,
      combinedMetadata,
    );
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }
    return right(this.#nodeToFeatureDTO(nodeOrErr.value as FeatureNode));
  }

  async updateFeature(
    ctx: AuthenticationContext,
    uuid: string,
    file: File,
  ): Promise<Either<AntboxError, FeatureDTO>> {
    const featureOrErr = await this.getFeature(ctx, uuid);

    if (featureOrErr.isLeft()) {
      return left(featureOrErr.value);
    }

    // Parse the new feature file to get updated metadata
    const newFeatureOrErr = await fileToFeature(file);
    if (newFeatureOrErr.isLeft()) {
      return left(newFeatureOrErr.value);
    }

    const newFeature = newFeatureOrErr.value;
    const newFeatureMetadata = featureToNodeMetadata(
      newFeature,
      ctx.principal.email,
    );

    // Update the file content
    const updateResult = await this._nodeService.updateFile(ctx, uuid, file);
    if (updateResult.isLeft()) {
      return left(updateResult.value);
    }

    // Update the node metadata with parsed feature data
    const updateMetadataOrErr = await this._nodeService.update(ctx, uuid, {
      title: newFeatureMetadata.title,
      description: newFeatureMetadata.description,
      exposeAction: newFeatureMetadata.exposeAction,
      runOnCreates: newFeatureMetadata.runOnCreates,
      runOnUpdates: newFeatureMetadata.runOnUpdates,
      runManually: newFeatureMetadata.runManually,
      filters: newFeatureMetadata.filters,
      exposeExtension: newFeatureMetadata.exposeExtension,
      exposeAITool: newFeatureMetadata.exposeAITool,
      runAs: newFeatureMetadata.runAs,
      groupsAllowed: newFeatureMetadata.groupsAllowed,
      parameters: newFeatureMetadata.parameters,
      returnType: newFeatureMetadata.returnType,
      returnDescription: newFeatureMetadata.returnDescription,
      returnContentType: newFeatureMetadata.returnContentType,
    });

    if (updateMetadataOrErr.isLeft()) {
      return left(updateMetadataOrErr.value);
    }

    // Get the updated node to return it
    const updatedNodeOrErr = await this._nodeService.get(ctx, uuid);
    if (updatedNodeOrErr.isLeft()) {
      return left(updatedNodeOrErr.value);
    }

    return right(
      this.#nodeToFeatureDTO(updatedNodeOrErr.value as FeatureNode),
    );
  }

  async deleteFeature(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, void>> {
    const featureOrErr = await this.getFeature(ctx, uuid);

    if (featureOrErr.isLeft()) {
      return left(featureOrErr.value);
    }

    return this._nodeService.delete(ctx, uuid);
  }

  async runFeature<T>(
    ctx: AuthenticationContext,
    uuid: string,
    args: Record<string, unknown>,
  ): Promise<Either<AntboxError, T>> {
    const featureOrErr = await this.#getNodeAsFunction(ctx, uuid);
    if (featureOrErr.isLeft()) {
      return left(featureOrErr.value);
    }

    const feature = featureOrErr.value;

    if (!feature.runManually && ctx.mode === "Direct") {
      return left(new BadRequestError("Feature cannot be run manually"));
    }

    const runContext: RunContext = {
      authenticationContext: ctx,
      nodeService: this._nodeService,
    };

    try {
      const result = await feature.run(runContext, args);
      return right(result as T);
    } catch (error) {
      return left(
        (error as AntboxError).errorCode
          ? (error as AntboxError)
          : new UnknownError((error as Error).message),
      );
    }
  }

  async runOnCreateScripts(ctx: AuthenticationContext, evt: NodeCreatedEvent) {
    if (evt.payload.parent === Folders.ROOT_FOLDER_UUID) {
      return;
    }

    const onCreateTasksOrErr = await this._nodeService.find(
      ctx,
      [
        ["parent", "==", evt.payload.parent],
        ["onCreate", "!=", ""],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (onCreateTasksOrErr.isLeft()) {
      return;
    }

    if (onCreateTasksOrErr.value.nodes.length === 0) {
      return;
    }

    const onCreateTasks = onCreateTasksOrErr.value.nodes.filter((task) =>
      (task as any).onCreate &&
      (task as any).onCreate.includes(evt.payload.uuid)
    );

    console.log("Running onCreate tasks", onCreateTasks.length);
  }

  async export(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, File>> {
    const featureOrErr = await this.getFeature(ctx, uuid);

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
      new File([exportContent], `${feature.name}.js`, {
        type: "application/javascript",
      }),
    );
  }

  // === ACTION METHODS ===

  async getAction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError, FeatureNode>> {
    const found = builtinActions.find((a) => a.uuid === uuid);

    if (found) {
      return right(
        FeatureNode.create(
          actionToNodeMetadata(found, Users.ROOT_USER_EMAIL) as any,
        )
          .right,
      );
    }

    const nodeOrErr = await this._nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isAction(nodeOrErr.value)) {
      return left(new NodeNotFoundError(uuid));
    }

    return right(nodeOrErr.value as FeatureNode);
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

    const actionsOrErrs = await this._nodeService.find(
      ctx,
      [
        ["mimetype", "==", Nodes.ACTION_MIMETYPE],
        ["parent", "==", Folders.ACTIONS_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    const featureNodes = featuresOrErrs.isRight()
      ? featuresOrErrs.value.nodes
      : [];
    const actionNodes = actionsOrErrs.isRight()
      ? actionsOrErrs.value.nodes
      : [];

    const nodes: NodeLike[] = [
      ...featureNodes,
      ...actionNodes,
      ...builtinActions.map((a) =>
        FeatureNode.create(
          actionToNodeMetadata(a, Users.ROOT_USER_EMAIL) as any,
        )
          .right
      ),
    ].sort((a, b) => a.title.localeCompare(b.title));

    return right(nodes);
  }

  async createOrReplaceAction(
    ctx: AuthenticationContext,
    file: File,
  ): Promise<Either<AntboxError, Node>> {
    const actionOrErr = await fileToAction(file);

    if (actionOrErr.isLeft()) {
      return left(actionOrErr.value);
    }

    const action = actionOrErr.value;
    const metadata = actionToNodeMetadata(action);

    const nodeOrErr = await this._nodeService.get(ctx, action.uuid);

    if (nodeOrErr.isLeft()) {
      return this._nodeService.createFile(ctx, file, {
        ...metadata,
        uuid: action.uuid,
        parent: Folders.ACTIONS_FOLDER_UUID,
      });
    }

    await this._nodeService.updateFile(ctx, action.uuid, file);

    // Update the node metadata with new action properties
    const updateResult = await this._nodeService.update(
      ctx,
      action.uuid,
      metadata,
    );
    if (updateResult.isLeft()) {
      return left(updateResult.value);
    }

    const updatedNodeOrErr = await this._nodeService.get(ctx, action.uuid);

    if (updatedNodeOrErr.isLeft()) {
      return left(updatedNodeOrErr.value);
    }

    return right(updatedNodeOrErr.value);
  }

  async deleteAction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, void>> {
    const actionOrErr = await this.getAction(ctx, uuid);

    if (actionOrErr.isLeft()) {
      return left(actionOrErr.value);
    }

    return this._nodeService.delete(ctx, uuid);
  }

  async exportAction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, File>> {
    const actionOrErr = await this.getAction(ctx, uuid);

    if (actionOrErr.isLeft()) {
      return left(actionOrErr.value);
    }

    const action = actionOrErr.value;
    const fileOrErr = await this._nodeService.export(ctx, uuid);

    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    return right(fileOrErr.value);
  }

  async runAction(
    ctx: AuthenticationContext,
    actionUuid: string,
    uuids: string[],
    params?: Record<string, unknown>,
  ): Promise<Either<AntboxError, unknown>> {
    const actionOrErr = await this.#getNodeAsAction(ctx, actionUuid);

    if (actionOrErr.isLeft()) {
      return left(actionOrErr.value);
    }

    const action: Action = actionOrErr.value;

    if (!action.runManually && ctx.mode === "Direct") {
      return left(new BadRequestError("Action cannot be run manually"));
    }

    const filteredResults = await this.#filterUuidsByAction(ctx, action, uuids);
    const filteredUuids = filteredResults
      .filter((u) => u.passed)
      .map((u) => u.uuid);

    if (filteredUuids.length === 0) {
      return right([]);
    }

    const runContext: RunContext = {
      authenticationContext: ctx,
      nodeService: this._nodeService,
    };

    try {
      const actionParams: Record<string, unknown> = params ?? {};
      const result = await action.run(
        runContext,
        filteredUuids,
        actionParams,
      );
      return right(result);
    } catch (error) {
      return left(
        (error as AntboxError).errorCode
          ? (error as AntboxError)
          : new UnknownError((error as Error).message),
      );
    }
  }

  async runAutomaticActionsForCreates(evt: NodeCreatedEvent) {
    const runCriteria: NodeFilter = ["runOnCreates", "==", true];

    const actions = await this.#getAutomaticActions(runCriteria);

    for (const action of actions) {
      const filterOrErr = NodesFilters.satisfiedBy(
        action.filters,
        evt.payload,
      );

      if (filterOrErr.isLeft()) {
        continue;
      }

      if (!filterOrErr.value) {
        continue;
      }

      const runContext: RunContext = {
        authenticationContext: UsersGroupsService.elevatedContext,
        nodeService: this._nodeService,
      };

      try {
        await action.run(runContext, [evt.payload.uuid], {});
      } catch (error) {
        console.error(`Error running action ${action.uuid}:`, error);
      }
    }
  }

  async runAutomaticActionsForUpdates(
    ctx: AuthenticationContext,
    evt: NodeUpdatedEvent,
  ) {
    const runCriteria: NodeFilter = ["runOnUpdates", "==", true];

    const actions = await this.#getAutomaticActions(runCriteria);

    for (const action of actions) {
      const filterOrErr = NodesFilters.satisfiedBy(
        action.filters,
        evt.payload as any,
      );

      if (filterOrErr.isLeft()) {
        continue;
      }

      if (!filterOrErr.value) {
        continue;
      }

      const runContext: RunContext = {
        authenticationContext: ctx,
        nodeService: this._nodeService,
      };

      try {
        await action.run(runContext, [evt.payload.uuid], {});
      } catch (error) {
        console.error(`Error running action ${action.uuid}:`, error);
      }
    }
  }

  async runOnUpdatedScripts(ctx: AuthenticationContext, evt: NodeUpdatedEvent) {
    const node = await this._nodeService.get(ctx, evt.payload.uuid);
    if (node.isLeft() || node.value.parent === Folders.ROOT_FOLDER_UUID) {
      return;
    }

    const featuresOrErr = await this._nodeService.find(
      ctx,
      [
        ["parent", "==", node.value.parent],
        ["onUpdate", "!=", ""],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (featuresOrErr.isLeft()) {
      return;
    }

    if (featuresOrErr.value.nodes.length === 0) {
      return;
    }

    const onUpdateTasks = featuresOrErr.value.nodes.filter((task: any) =>
      (task as any).onUpdate &&
      (task as any).onUpdate.includes(evt.payload.uuid)
    );

    console.log("Running onUpdate tasks", onUpdateTasks.length);
  }

  // === EXTENSION METHODS ===

  async createOrReplaceExtension(
    ctx: AuthenticationContext,
    file: File,
    metadata: {
      uuid?: string;
      title?: string;
      description?: string;
      exposeExtension?: boolean;
    },
  ): Promise<Either<AntboxError, FeatureNode>> {
    if (file.type !== "application/javascript") {
      return left(new BadRequestError(`Invalid mimetype: ${file.type}`));
    }

    const uuid = metadata.uuid ?? file.name?.split(".")[0].trim();

    const nodeOrErr = await this._nodeService.get(ctx, uuid);
    if (nodeOrErr.isLeft()) {
      const createResult = await this._nodeService.createFile(ctx, file, {
        uuid,
        title: metadata.title ?? uuid,
        description: metadata.description ?? "",
        mimetype: Nodes.EXT_MIMETYPE,
        parent: Folders.EXT_FOLDER_UUID,
        exposeExtension: metadata.exposeExtension ?? true,
      });

      if (createResult.isLeft()) {
        return left(createResult.value);
      }

      return right(createResult.value as FeatureNode);
    }

    let voidOrErr = await this._nodeService.updateFile(ctx, uuid, file);

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    voidOrErr = await this._nodeService.update(ctx, uuid, {
      title: metadata.title,
      description: metadata.description,
      exposeExtension: metadata.exposeExtension ?? true,
    });

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    const updatedNodeOrErr = await this._nodeService.get(ctx, uuid);
    if (updatedNodeOrErr.isLeft()) {
      return left(updatedNodeOrErr.value);
    }

    return right(updatedNodeOrErr.value as FeatureNode);
  }

  async getExtension(
    uuid: string,
    ctx?: AuthenticationContext,
  ): Promise<Either<NodeNotFoundError, FeatureNode>> {
    const nodeOrErr = await this._nodeService.get(
      ctx || UsersGroupsService.elevatedContext,
      uuid,
    );
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isExt(nodeOrErr.value)) {
      return left(new NodeNotFoundError(uuid));
    }

    return right(nodeOrErr.value as FeatureNode);
  }

  async updateExtension(
    ctx: AuthenticationContext,
    uuid: string,
    metadata: { title?: string; description?: string; size?: number },
  ) {
    const extOrErr = await this.getExtension(uuid, ctx);

    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const ext = extOrErr.value;
    const voidOrErr = await this._nodeService.update(ctx, uuid, {
      title: metadata.title,
      description: metadata.description,
      size: metadata.size,
    });

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(ext);
  }

  async deleteExtension(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, void>> {
    const extOrErr = await this.getExtension(uuid, ctx);

    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    return this._nodeService.delete(ctx, uuid);
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

    const extsOrErrs = await this._nodeService.find(
      UsersGroupsService.elevatedContext,
      [
        ["mimetype", "==", Nodes.EXT_MIMETYPE],
        ["parent", "==", Folders.EXT_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    const featureNodes = featuresOrErrs.isRight()
      ? featuresOrErrs.value.nodes
      : [];
    const extNodes = extsOrErrs.isRight() ? extsOrErrs.value.nodes : [];

    return right([...featureNodes, ...extNodes]);
  }

  async exportExtension(uuid: string): Promise<Either<AntboxError, File>> {
    const nodeOrErr = await this.getExtension(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this._nodeService.export(UsersGroupsService.elevatedContext, uuid);
  }

  async runExtension(
    uuid: string,
    request: Request,
    _parameters?: Record<string, unknown>,
  ): Promise<Either<NodeNotFoundError | Error, Response>> {
    // First check if the feature is exposed as extension
    const featureOrErr = await this.getExtension(uuid);
    if (featureOrErr.isLeft()) {
      return left(featureOrErr.value);
    }

    const feature = featureOrErr.value;
    if (!feature.exposeExtension) {
      return left(new BadRequestError("Feature is not exposed as extension"));
    }

    try {
      FeatureService.#incRunnable([uuid, "ext"]);

      const moduleOrErr = await this.#getExtensionAsModule(uuid);

      if (moduleOrErr.isLeft()) {
        return left(moduleOrErr.value);
      }

      const module = moduleOrErr.value;

      if (typeof module !== "function") {
        return left(new BadRequestError("Extension must export a function"));
      }

      const response = await module(request, this._nodeService);
      return right(response);
    } catch (error) {
      return left(
        new UnknownError(`Extension error: ${(error as Error).message}`),
      );
    }
  }

  async #getNodeAsFunction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, Feature>> {
    const nodeOrErr = await this._nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isFeature(nodeOrErr.value)) {
      return left(new FeatureNotFoundError(uuid));
    }

    const fileOrErr = await this._nodeService.export(ctx, uuid);

    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    const featureOrErr = await fileToFeature(fileOrErr.value);

    if (featureOrErr.isLeft()) {
      return left(featureOrErr.value);
    }

    return right(featureOrErr.value);
  }

  async #getNodeAsAction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, Action>> {
    if (builtinActions.some((a) => a.uuid === uuid)) {
      return right(builtinActions.find((a) => a.uuid === uuid)!);
    }

    const nodeOrErr = await this._nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isAction(nodeOrErr.value)) {
      return left(new NodeNotFoundError(uuid));
    }

    const fileOrErr = await this._nodeService.export(ctx, uuid);

    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    const actionOrErr = await fileToAction(fileOrErr.value);

    if (actionOrErr.isLeft()) {
      return left(actionOrErr.value);
    }

    return right(actionOrErr.value);
  }

  async #getExtensionAsModule(
    uuid: string,
  ): Promise<Either<AntboxError, ExtFn>> {
    const fileOrError = await this._nodeService.export(
      UsersGroupsService.elevatedContext,
      uuid,
    );

    if (fileOrError.isLeft()) {
      return left(fileOrError.value);
    }

    const file = fileOrError.value;

    const module = await import(URL.createObjectURL(file));

    return right(module.default);
  }

  async #getAutomaticActions(
    criteria: NodeFilter,
  ): Promise<Action[]> {
    // Get builtin actions that match criteria
    const builtinMatches = builtinActions.filter((a) => {
      const [key, op, value] = criteria;
      return op === "=="
        ? (a as any)[key] === value
        : (a as any)[key] !== value;
    });

    // Get action nodes from the repository
    const actionsOrErrs = await this._nodeService.find(
      UsersGroupsService.elevatedContext,
      [
        ["mimetype", "==", Nodes.ACTION_MIMETYPE],
        ["parent", "==", Folders.ACTIONS_FOLDER_UUID],
        criteria,
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (actionsOrErrs.isLeft()) {
      return builtinMatches;
    }

    const actions = [];
    for (const node of actionsOrErrs.value.nodes) {
      const actionOrErr = await this.#getNodeAsAction(
        UsersGroupsService.elevatedContext,
        node.uuid,
      );

      if (actionOrErr.isRight()) {
        actions.push(actionOrErr.value);
      }
    }

    return [...builtinMatches, ...actions];
  }

  async #filterUuidsByAction(
    ctx: AuthenticationContext,
    action: Action,
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

  #nodeToFeatureDTO(node: FeatureNode): FeatureDTO {
    return {
      id: node.uuid,
      name: node.title,
      description: node.description || "",
      exposeAction: node.exposeAction,
      runOnCreates: node.runOnCreates,
      runOnUpdates: node.runOnUpdates,
      runManually: node.runManually,
      filters: node.filters,
      exposeExtension: node.exposeExtension,
      exposeAITool: node.exposeAITool,
      runAs: node.runAs,
      groupsAllowed: node.groupsAllowed,
      parameters: node.parameters,
      returnType: node.returnType,
      returnDescription: node.returnDescription,
      returnContentType: node.returnContentType,
    };
  }

  run(
    ctx: AuthenticationContext,
    uuid: string,
    argsOrUuids: Record<string, unknown> | string[],
    params?: Record<string, unknown>,
  ) {
    // If argsOrUuids is an object and params is undefined, run as feature
    if (
      typeof argsOrUuids === "object" && !Array.isArray(argsOrUuids) &&
      params === undefined
    ) {
      return this.runFeature(ctx, uuid, argsOrUuids);
    }
    // Otherwise, run as action
    return this.runAction(ctx, uuid, argsOrUuids as string[], params);
  }

  // === COMPATIBILITY ALIASES ===

  // Feature compatibility methods
  create(ctx: AuthenticationContext, file: File) {
    return this.createFeature(ctx, file);
  }

  get(ctx: AuthenticationContext, uuid: string) {
    return this.getAction(ctx, uuid);
  }

  updateFile(ctx: AuthenticationContext, uuid: string, file: File) {
    return this.updateFeature(ctx, uuid, file);
  }

  delete(ctx: AuthenticationContext, uuid: string) {
    return this.deleteFeature(ctx, uuid);
  }

  // Export methods for handlers
  exportFeature(ctx: AuthenticationContext, uuid: string) {
    return this.export(ctx, uuid);
  }

  exportFeatureForType(
    ctx: AuthenticationContext,
    uuid: string,
    type: string = "feature",
  ) {
    // For now, just call the basic export method
    // Could be enhanced to handle different export types
    return this.export(ctx, uuid);
  }
}
