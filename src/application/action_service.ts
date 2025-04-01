import { type Action, actionNodeToNodeMetadata, actionToNode, fileToAction } from "domain/actions/action.ts";
import { ActionNode } from "domain/actions/action_node.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError, BadRequestError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { UsersGroupsService } from "./users_groups_service.ts";
import { type AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "./node_service.ts";
import type { RunContext } from "domain/actions/run_context.ts";
import { builtinActions } from "./builtin_actions/index.ts";
import type { NodeFilter, NodeFilters } from "domain/nodes/node_filter.ts";
import { nodeToAction, type ActionDTO } from "./action_dto.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";

type RecordKey = [string, string];
interface RunnableRecord {
  count: number;
  timestamp: number;
}

export class ActionService {
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

  static #deleteRunnable(key: RecordKey) {
    this.#runnable.delete(key);
  }

  constructor(
    private readonly nodeService: NodeService,
    private readonly usersGroupsService: UsersGroupsService,
  ) {}

  async createOrReplace(
    ctx: AuthenticationContext,
    file: File,
  ): Promise<Either<AntboxError, ActionDTO>> {
    const actionOrErr = await fileToAction(file);
    
    if (actionOrErr.isLeft()) {
      return left(actionOrErr.value);
    }
    
    const action = actionToNode(ctx, actionOrErr.value);

    const nodeOrErr = await this.nodeService.get(ctx, action.uuid);
    if (nodeOrErr.isLeft()) {
      const actionOrErr = await this.nodeService.createFile(ctx, file, actionNodeToNodeMetadata(action));
      if (actionOrErr.isLeft()) {
        return left(actionOrErr.value);
      }

      return right(nodeToAction(actionOrErr.value));
    }

    const decoratedFile = new File([file], nodeOrErr.value.title, {
      type: nodeOrErr.value.mimetype,
    });

    let voidOrErr = await this.nodeService.updateFile(ctx, action.uuid, decoratedFile);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    voidOrErr = await this.nodeService.update(ctx, action.uuid, {
      ...actionNodeToNodeMetadata(action),
      size: file.size,
    });
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return this.get(ctx, action.uuid);
  }

  async get(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError, ActionDTO>> {
    const found = builtinActions.find((a) => a.uuid === uuid);

    if (found) {
      return right(nodeToAction(found));
    }

    const nodeOrErr = await this.nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isAction(nodeOrErr.value)) {
      return left(new NodeNotFoundError(uuid));
    }

    return right(nodeToAction(nodeOrErr.value));
  }

  async delete(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, void>> {
    const nodeOrErr = await this.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.delete(ctx, uuid);
  }

  async list(ctx: AuthenticationContext): Promise<ActionDTO[]> {
    const nodesOrErrs = await this.nodeService.find(
      ctx,
      [
        ["mimetype", "==", Nodes.ACTION_MIMETYPE],
        ["parent", "==", Folders.ACTIONS_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      return [];
    }

    const nodes = [
      ...(nodesOrErrs.value.nodes as ActionDTO[]),
      ...builtinActions.map((a) => nodeToAction(a)),
    ].sort((a, b) => a.title.localeCompare(b.title));

    return nodes;
  }

  async run(
    ctx: AuthenticationContext,
    actionUuid: string,
    nodesUuids: string[],
    params?: Record<string, string>,
  ): Promise<Either<AntboxError, void>> {
    if (this.#ranTooManyTimes(actionUuid, nodesUuids)) {
      const message = `Action ran too many times: ${actionUuid}${nodesUuids.join(",")}`;
      console.error(message);
      return left(new BadRequestError(message));
    }

    const actionOrErr = await this.#getNodeAsAction(ctx, actionUuid);
    if (actionOrErr.isLeft()) {
      return left(actionOrErr.value);
    }

    const action = actionOrErr.value;

    if (!action.runManually && ctx.mode === "Direct") {
      return left(new BadRequestError("Action cannot be run manually"));
    }

    const uuidsOrErr = await this.#getValidNodesForAction(ctx, action, nodesUuids);

    if (uuidsOrErr.isLeft()) {
      return left(uuidsOrErr.value);
    }

    if (uuidsOrErr.value.length === 0) {
      return right(undefined);
    }

    const error = await action
      .run(await this.#buildRunContext(ctx, action.runAs), uuidsOrErr.value, params)
      .catch((e) => e);

    if (error) {
      return (error as AntboxError).errorCode
        ? left(error as AntboxError)
        : left(new UnknownError(error.message));
    }

    return right(undefined);
  }

  async export(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, File>> {
    const builtIn = builtinActions.find((a) => a.uuid === uuid);
    if (builtIn) {
      const file = new File([builtIn.toString()], builtIn.title, {
        type: "application/javascript",
      });
      return right(file);
    }

    const nodeOrErr = await this.get(ctx, uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const file = new File([JSON.stringify(nodeOrErr.value)], `${nodeOrErr.value.title}.js`, { 
      type: "application/javascript" 
    });

    return right(file);
  }

  async #getNodeAsAction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, Action>> {
    if (builtinActions.some((a) => a.uuid === uuid)) {
      return right(builtinActions.find((a) => a.uuid === uuid)!);
    }

    const nodeOrErr = await this.nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isAction(nodeOrErr.value)) {
      return left(new NodeNotFoundError(uuid));
    }

    const fileOrErr = await this.nodeService.export(ctx, uuid);
    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    return fileToAction(fileOrErr.value);
  }

  #ranTooManyTimes(uuid: string, uuids: string[]): boolean {
    const key = uuids.join(",");
    const timestamp = Date.now();
    const timeout = 1000 * 10; // 10 seconds
    const maxCount = 10;

    const entry = ActionService.#getRunnable([uuid, key]);

    if (entry.count >= maxCount || entry.timestamp + timeout < timestamp) {
      ActionService.#deleteRunnable([uuid, key]);
      return true;
    }

    ActionService.#incRunnable([uuid, key]);
    return false;
  }

  async #getValidNodesForAction(
    ctx: AuthenticationContext,
    action: Action,
    uuids: string[],
  ): Promise<Either<AntboxError, string[]>> {
    if (action.filters?.length < 1) {
      return right(uuids);
    }

    const nodesOrErr = await Promise.all(uuids.map((uuid) => this.nodeService.get(ctx, uuid)));

    if (nodesOrErr.some((n) => n.isLeft())) {
      return nodesOrErr.find((n) => n.isLeft()) as Either<AntboxError, never>;
    }

    const nodes = nodesOrErr
      .map((n) => n.right)
      .filter((n) => NodesFilters.satisfiedBy(action.filters, n).isRight());

    return right(nodes.map((n) => n.uuid));
  }

  async runAutomaticActionsForCreates(evt: NodeCreatedEvent) {
    const runCriteria: NodeFilter = ["runOnCreates", "==", true];

    const ctxOrErr = await this.#getAuthCtxByEmail(evt.userEmail);
    if (ctxOrErr.isLeft()) {
      return;
    }

    const ctx = ctxOrErr.value;

    let group = Nodes.isFolder(evt.payload) ? evt.payload.group : undefined;

    if (!group) {
      const parent = await this.nodeService.get(UsersGroupsService.elevatedContext(), evt.payload.parent);
      group = (parent.right as FolderNode).group;
    }

    const actions = await this.#getAutomaticActions(ctx, evt.payload, runCriteria);
    return this.#runActions(
      ctxOrErr.value,
      actions.map((a) => a.uuid),
      evt.payload.uuid,
    );
  }

  async runAutomaticActionsForUpdates(ctx: AuthenticationContext, evt: NodeUpdatedEvent) {
    const runCriteria: NodeFilter = ["runOnUpdates", "==", true];

    const userOrErr = await this.#getAuthCtxByEmail(evt.userEmail);
    if (userOrErr.isLeft()) {
      return;
    }

    const node = await this.nodeService.get(ctx, evt.payload.uuid);
    if (node.isLeft()) {
      return;
    }

    const actions = await this.#getAutomaticActions(ctx, node.value, runCriteria);
    if (actions.length === 0) {
      return;
    }

    return this.#runActions(
      userOrErr.value,
      actions.map((a) => a.uuid),
      evt.payload.uuid,
    );
  }

  async #getAuthCtxByEmail(email: string): Promise<Either<AntboxError, AuthenticationContext>> {
    const userOrErr = await this.usersGroupsService.getUserByEmail(UsersGroupsService.elevatedContext(), email);
    if (userOrErr.isLeft()) {
      return left(userOrErr.value);
    }

    return right({
      mode: "Action",
      tenant: "default",
      principal: {
        email: userOrErr.value.email,
        groups: [userOrErr.value.group, ...userOrErr.value.groups],
      },
    });
  }

  async #buildRunContext(ctx: AuthenticationContext, runAs?: string): Promise<RunContext> {
    const defaultCtx: RunContext = {
      authenticationContext: ctx,
      nodeService: this.nodeService,
    };

    if (!runAs) {
      return defaultCtx;
    }

    const authContextOrErr = await this.#getAuthCtxByEmail(runAs);
    if (authContextOrErr.isLeft()) {
      return defaultCtx;
    }

    return {
      authenticationContext: {
        ...ctx,
        ...authContextOrErr.value,
      },
      nodeService: this.nodeService,
    };
  }

  async #getAutomaticActions(
    ctx: AuthenticationContext,
    node: Node,
    runOnCriteria: NodeFilter,
  ): Promise<Action[]> {
    const filters: NodeFilter[] = [["mimetype", "==", Nodes.ACTION_MIMETYPE], runOnCriteria];
    const actionsOrErr = await this.nodeService.find(ctx, filters, Number.MAX_SAFE_INTEGER);
    if (actionsOrErr.isLeft()) {
      return [];
    }

    const nodes = actionsOrErr.value.nodes as ActionNode[];

    const actionsTasks = nodes
      .filter((a) => NodesFilters.nodeSpecificationFrom(a.filters))
      .map((a) => this.nodeService.export(ctx, a.uuid));

    const filesOrErrs = await Promise.all(actionsTasks);

    const actions = filesOrErrs
      .filter((v) => v.isRight())
      .map((v) => v.value as File)
      .map(async (v) => await fileToAction(v));

    return Promise.all(actions).then((a) =>
      a.filter((v) => v.isRight()).map((v) => v.value as Action),
    );
  }

  async runOnCreateScritps(ctx: AuthenticationContext, evt: NodeCreatedEvent) {
    if (evt.payload.parent === Folders.ROOT_FOLDER_UUID) {
      return;
    }

    const userOrErr = await this.#getAuthCtxByEmail(evt.userEmail);
    if (userOrErr.isLeft()) {
      return;
    }

    const parentOrErr = await this.nodeService.get(ctx, evt.payload.parent!);
    if (parentOrErr.isLeft() || !Nodes.isFolder(parentOrErr.value)) {
      return;
    }

    return this.#runActions(
      userOrErr.value,
      parentOrErr.value.onCreate.filter(this.#nonEmptyActions),
      evt.payload.uuid,
    );
  }

  async runOnUpdatedScritps(ctx: AuthenticationContext, evt: NodeUpdatedEvent) {
    return this.nodeService.get(ctx, evt.payload.uuid).then(async (node) => {
      if (node.isLeft() || node.value.parent === Folders.ROOT_FOLDER_UUID) {
        return;
      }

      const parent = await this.nodeService.get(ctx, node.value.parent);

      if (parent.isLeft() || !Nodes.isFolder(parent.value)) {
        return;
      }

      const userOrErr = await this.#getAuthCtxByEmail(evt.userEmail);
      if (userOrErr.isLeft()) {
        return;
      }

      return this.#runActions(
        userOrErr.value,
        parent.value.onUpdate.filter(this.#nonEmptyActions),
        evt.payload.uuid,
      );
    });
  }

  #nonEmptyActions(uuid: string): boolean {
    return uuid?.length > 0;
  }

  #runActions(authContext: AuthenticationContext, actions: string[], uuid: string) {
    for (const action of actions) {
      const [actionUuid, params] = action.split(" ");
      const j = `{${params ?? ""}}`;
      const g = j.replaceAll(/(\w+)=(\w+)/g, '"$1": "$2"');

      this.run(authContext, actionUuid, [uuid], JSON.parse(g)).then((voidOrErr) => {
        if (voidOrErr.isLeft()) {
          console.error(voidOrErr.value.message);
        }
      });
    }
  }
}
