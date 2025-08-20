import type { Skill } from "domain/skills/skill.ts";
import { fileToFunction, skillToNodeMetadata } from "domain/skills/skill.ts";
import {
  type Action,
  actionToNodeMetadata,
  fileToAction,
} from "domain/skills/action.ts";
import { SkillNode } from "domain/skills/skill_node.ts";
import { SkillNotFoundError } from "domain/skills/skill_not_found_error.ts";
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
import { SkillDTO } from "application/skill_dto.ts";
import { RunContext } from "domain/skills/skill_run_context.ts";
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

export class SkillService {
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
    private readonly nodeService: NodeService,
    private readonly authService: UsersGroupsService,
  ) {}

  // === SKILL METHODS ===

  async getSkill(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError | SkillNotFoundError, SkillDTO>> {
    const nodeOrErr = await this.nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isSkill(nodeOrErr.value)) {
      return left(new SkillNotFoundError(uuid));
    }

    const skill = nodeOrErr.value;
    return right(this.#nodeToSkillDTO(skill));
  }

  async listSkills(
    ctx: AuthenticationContext,
  ): Promise<Either<AntboxError, SkillDTO[]>> {
    const nodesOrErrs = await this.nodeService.find(
      ctx,
      [
        ["mimetype", "==", Nodes.SKILL_MIMETYPE],
        ["parent", "==", Folders.SKILLS_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      return left(nodesOrErrs.value);
    }

    const nodes = nodesOrErrs.value.nodes as SkillNode[];
    const dtos = nodes.map((n) => this.#nodeToSkillDTO(n));

    return right(dtos);
  }

  async createSkill(
    ctx: AuthenticationContext,
    file: File,
    metadata?: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, SkillDTO>> {
    const skillOrErr = await fileToFunction(file);

    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    const skill = skillOrErr.value;
    const skillMetadata = skillToNodeMetadata(skill, ctx.principal.email);
    const combinedMetadata = metadata
      ? { ...skillMetadata, ...metadata }
      : skillMetadata;

    const nodeOrErr = await this.nodeService.createFile(
      ctx,
      file,
      combinedMetadata,
    );
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return right(this.#nodeToSkillDTO(nodeOrErr.value as SkillNode));
  }

  async updateSkill(
    ctx: AuthenticationContext,
    uuid: string,
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, SkillDTO>> {
    const skillOrErr = await this.getSkill(ctx, uuid);

    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    const voidOrErr = await this.nodeService.update(ctx, uuid, metadata);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    // Get the updated node to return it
    const updatedNodeOrErr = await this.nodeService.get(ctx, uuid);
    if (updatedNodeOrErr.isLeft()) {
      return left(updatedNodeOrErr.value);
    }

    return right(
      this.#nodeToSkillDTO(updatedNodeOrErr.value as SkillNode),
    );
  }

  async updateSkillFile(
    ctx: AuthenticationContext,
    uuid: string,
    file: File,
  ): Promise<Either<AntboxError, SkillDTO>> {
    const skillOrErr = await this.getSkill(ctx, uuid);

    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    const voidOrErr = await this.nodeService.updateFile(ctx, uuid, file);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    // Get the updated node to return it
    const updatedNodeOrErr = await this.nodeService.get(ctx, uuid);
    if (updatedNodeOrErr.isLeft()) {
      return left(updatedNodeOrErr.value);
    }

    return right(
      this.#nodeToSkillDTO(updatedNodeOrErr.value as SkillNode),
    );
  }

  async deleteSkill(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, void>> {
    const skillOrErr = await this.getSkill(ctx, uuid);

    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    return this.nodeService.delete(ctx, uuid);
  }

  async runSkill<T>(
    ctx: AuthenticationContext,
    uuid: string,
    args: Record<string, unknown>,
  ): Promise<Either<AntboxError, T>> {
    const skillOrErr = await this.#getNodeAsFunction(ctx, uuid);
    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    const skill = skillOrErr.value;

    if (!skill.runManually && ctx.mode === "Direct") {
      return left(new BadRequestError("Skill cannot be run manually"));
    }

    let runCtx: RunContext = {
      authenticationContext: ctx,
      nodeService: this.nodeService,
    };

    if (skill.runAs) {
      const authContextOrErr = await this.#getAuthCtxByEmail(skill.runAs);
      if (authContextOrErr.isRight()) {
        runCtx = {
          authenticationContext: {
            ...ctx,
            ...authContextOrErr.value,
          },
          nodeService: this.nodeService,
        };
      }
    }

    try {
      const result = await skill.run(runCtx, args);
      return right(result as T);
    } catch (error) {
      return left(
        (error as AntboxError).errorCode
          ? (error as AntboxError)
          : new UnknownError((error as Error).message),
      );
    }
  }

  async exportSkill(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, File>> {
    const skillOrErr = await this.getSkill(ctx, uuid);
    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    return this.nodeService.export(ctx, uuid);
  }

  // === ACTION METHODS ===

  async getAction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError, SkillNode>> {
    const found = builtinActions.find((a) => a.uuid === uuid);

    if (found) {
      return right(
        SkillNode.create(
          actionToNodeMetadata(found, Users.ROOT_USER_EMAIL) as any,
        )
          .right,
      );
    }

    const nodeOrErr = await this.nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isAction(nodeOrErr.value)) {
      return left(new NodeNotFoundError(uuid));
    }

    return right(nodeOrErr.value);
  }

  async listActions(
    ctx: AuthenticationContext,
  ): Promise<Either<AntboxError, SkillNode[]>> {
    const nodesOrErrs = await this.nodeService.find(
      ctx,
      [
        ["mimetype", "==", Nodes.ACTION_MIMETYPE],
        ["parent", "==", Folders.ACTIONS_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      return left(nodesOrErrs.value);
    }

    const nodes = [
      ...(nodesOrErrs.value.nodes as SkillNode[]),
      ...builtinActions.map((a) =>
        SkillNode.create(actionToNodeMetadata(a, Users.ROOT_USER_EMAIL) as any)
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

    const nodeOrErr = await this.nodeService.get(ctx, action.uuid);

    if (nodeOrErr.isLeft()) {
      return this.nodeService.createFile(ctx, file, {
        ...metadata,
        uuid: action.uuid,
        parent: Folders.ACTIONS_FOLDER_UUID,
      });
    }

    await this.nodeService.updateFile(ctx, action.uuid, file);

    const updatedNodeOrErr = await this.nodeService.get(ctx, action.uuid);

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

    return this.nodeService.delete(ctx, uuid);
  }

  async runAction(
    ctx: AuthenticationContext,
    actionUuid: string,
    uuids: string[],
    params?: Record<string, unknown>,
  ): Promise<Either<AntboxError, void>> {
    const action = await this.#getNodeAsAction(ctx, actionUuid);

    if (action.isLeft()) {
      return left(action.value);
    }

    const uuidsOrErr = await this.#filterUuidsByAction(
      ctx,
      action.value,
      uuids,
    );

    if (uuidsOrErr.isLeft()) {
      return left(uuidsOrErr.value);
    }

    if (uuidsOrErr.value.length === 0) {
      return right(undefined);
    }

    const error = await action.value
      .run(
        await this.#buildRunContext(ctx, action.value.runAs),
        uuidsOrErr.value,
        params,
      )
      .catch((e: unknown) => e);

    if (error) {
      return (error as AntboxError).errorCode
        ? left(error as AntboxError)
        : left(new UnknownError((error as Error).message));
    }

    return right(undefined);
  }

  async exportAction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, File>> {
    const builtIn = builtinActions.find((a) => a.uuid === uuid);
    if (builtIn) {
      const file = new File([builtIn.toString()], builtIn.title.concat(".js"), {
        type: "application/javascript",
      });
      return right(file);
    }

    const nodeOrErr = await this.getAction(ctx, uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.export(ctx, uuid);
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

      await action.run(
        await this.#buildRunContext(
          UsersGroupsService.elevatedContext,
          action.runAs,
        ),
        [evt.payload.uuid],
        {},
      );
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

      await action.run(
        await this.#buildRunContext(ctx, action.runAs),
        [evt.payload.uuid],
        {},
      );
    }
  }

  async runOnCreateScripts(ctx: AuthenticationContext, evt: NodeCreatedEvent) {
    if (evt.payload.parent === Folders.ROOT_FOLDER_UUID) {
      return;
    }

    const onCreateTasksOrErr = await this.nodeService.find(
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

  async runOnUpdatedScripts(ctx: AuthenticationContext, evt: NodeUpdatedEvent) {
    const node = await this.nodeService.get(ctx, evt.payload.uuid);
    if (node.isLeft() || node.value.parent === Folders.ROOT_FOLDER_UUID) {
      return;
    }

    const onUpdateTasksOrErr = await this.nodeService.find(
      ctx,
      [
        ["parent", "==", node.value.parent],
        ["onUpdate", "!=", ""],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (onUpdateTasksOrErr.isLeft()) {
      return;
    }

    if (onUpdateTasksOrErr.value.nodes.length === 0) {
      return;
    }

    const onUpdateTasks = onUpdateTasksOrErr.value.nodes.filter((task) =>
      (task as any).onUpdate &&
      (task as any).onUpdate.includes(evt.payload.uuid)
    );

    console.log("Running onUpdate tasks", onUpdateTasks.length);
  }

  // === EXTENSION METHODS ===

  async createOrReplaceExtension(
    ctx: AuthenticationContext,
    file: File,
    metadata: { uuid?: string; title?: string; description?: string },
  ): Promise<Either<AntboxError, SkillNode>> {
    if (file.type !== "application/javascript") {
      return left(new BadRequestError(`Invalid mimetype: ${file.type}`));
    }

    const uuid = metadata.uuid ?? file.name?.split(".")[0].trim();

    const nodeOrErr = await this.nodeService.get(ctx, uuid);
    if (nodeOrErr.isLeft()) {
      const createResult = await this.nodeService.createFile(ctx, file, {
        uuid,
        title: metadata.title ?? uuid,
        description: metadata.description ?? "",
        mimetype: Nodes.EXT_MIMETYPE,
        parent: Folders.EXT_FOLDER_UUID,
      });

      if (createResult.isLeft()) {
        return left(createResult.value);
      }

      return right(createResult.value as SkillNode);
    }

    let voidOrErr = await this.nodeService.updateFile(ctx, uuid, file);

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    voidOrErr = await this.nodeService.update(ctx, uuid, {
      ...metadata,
      size: file.size,
    });
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return this.getExtension(uuid);
  }

  async getExtension(
    uuid: string,
  ): Promise<Either<NodeNotFoundError, SkillNode>> {
    const nodeOrErr = await this.nodeService.get(
      UsersGroupsService.elevatedContext,
      uuid,
    );
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isExt(nodeOrErr.value)) {
      return left(new NodeNotFoundError(uuid));
    }

    return right(nodeOrErr.value as SkillNode);
  }

  async updateExtension(
    ctx: AuthenticationContext,
    uuid: string,
    metadata: { title?: string; description?: string; size?: number },
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.getExtension(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const safe: Partial<{ title: string; description: string; size: number }> =
      {};
    for (const [key, value] of Object.entries(metadata)) {
      if (!["title", "description", "size"].includes(key)) {
        continue;
      }
      Object.assign(safe, { [key]: value });
    }

    const voidOrErr = await this.nodeService.update(ctx, uuid, safe);

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(undefined);
  }

  async deleteExtension(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.getExtension(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.delete(ctx, uuid);
  }

  async listExtensions(): Promise<Either<AntboxError, NodeLike[]>> {
    const nodesOrErrs = await this.nodeService.find(
      UsersGroupsService.elevatedContext,
      [
        ["mimetype", "==", Nodes.EXT_MIMETYPE],
        ["parent", "==", Folders.EXT_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      return left(nodesOrErrs.value);
    }

    return right(nodesOrErrs.value.nodes);
  }

  async exportExtension(uuid: string): Promise<Either<AntboxError, File>> {
    const nodeOrErr = await this.getExtension(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.export(
      UsersGroupsService.elevatedContext,
      uuid,
    );
  }

  async runExtension(
    uuid: string,
    request: Request,
  ): Promise<Either<NodeNotFoundError | Error, Response>> {
    const extOrErr = await this.#getExtensionAsModule(uuid);

    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const resp = await extOrErr.value(request, this.nodeService);

    return right(resp);
  }

  // === PRIVATE METHODS ===

  async #getNodeAsFunction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, Skill>> {
    const nodeOrErr = await this.nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isSkill(nodeOrErr.value)) {
      return left(new SkillNotFoundError(uuid));
    }

    const fileOrErr = await this.nodeService.export(ctx, uuid);
    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    return fileToFunction(fileOrErr.value);
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

  async #getExtensionAsModule(
    uuid: string,
  ): Promise<Either<AntboxError, ExtFn>> {
    const [nodeError, fileOrError] = await Promise.all([
      this.getExtension(uuid),
      this.nodeService.export(UsersGroupsService.elevatedContext, uuid),
    ]);

    if (fileOrError.isLeft()) {
      return left(fileOrError.value);
    }

    if (nodeError.isLeft()) {
      return left(nodeError.value);
    }

    const file = fileOrError.value;

    const module = await import(URL.createObjectURL(file));

    return right(module.default);
  }

  async #getAuthCtxByEmail(
    email: string,
  ): Promise<Either<AntboxError, AuthenticationContext>> {
    const userOrErr = await this.authService.getUser(
      UsersGroupsService.elevatedContext,
      email,
    );
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

  async #buildRunContext(
    ctx: AuthenticationContext,
    runAs?: string,
  ): Promise<RunContext> {
    let runCtx: RunContext = {
      authenticationContext: ctx,
      nodeService: this.nodeService,
    };

    if (runAs) {
      const authContextOrErr = await this.#getAuthCtxByEmail(runAs);
      if (authContextOrErr.isRight()) {
        runCtx = {
          authenticationContext: {
            ...ctx,
            ...authContextOrErr.value,
          },
          nodeService: this.nodeService,
        };
      }
    }

    return runCtx;
  }

  async #filterUuidsByAction(
    ctx: AuthenticationContext,
    action: Action,
    uuids: string[],
  ): Promise<Either<AntboxError, string[]>> {
    if (action.filters.length === 0) {
      return right(uuids);
    }

    const promises = uuids.map(async (uuid) => {
      const nodeOrErr = await this.nodeService.get(ctx, uuid);

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

    const results = await Promise.all(promises);

    return right(results.filter((r) => r.passed).map((r) => r.uuid));
  }

  async #getAutomaticActions(runCriteria: NodeFilter): Promise<Action[]> {
    const actionsTasks = [
      ...builtinActions
        .filter((a) => {
          const [key, op, value] = runCriteria;
          return op === "=="
            ? (a as any)[key] === value
            : (a as any)[key] !== value;
        }),
    ];

    const nodesOrErrs = await this.nodeService.find(
      UsersGroupsService.elevatedContext,
      [
        ["mimetype", "==", Nodes.ACTION_MIMETYPE],
        ["parent", "==", Folders.ACTIONS_FOLDER_UUID],
        runCriteria,
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      return actionsTasks;
    }

    const filesOrErrs = await Promise.all(
      nodesOrErrs.value.nodes.map((node) =>
        this.nodeService.export(UsersGroupsService.elevatedContext, node.uuid)
      ),
    );

    const actions = filesOrErrs
      .filter((v) => v.isRight())
      .map((v) => v.value as File)
      .map(async (v: File) => await fileToAction(v));

    return Promise.all(actions).then((a) =>
      a.filter((v) => v.isRight()).map((v) => v.value as Action)
    );
  }

  #nodeToSkillDTO(node: SkillNode): SkillDTO {
    return {
      id: node.uuid,
      name: node.name,
      description: node.description || "",
      exposeAction: node.exposeAction,
      runOnCreates: node.runOnCreates,
      runOnUpdates: node.runOnUpdates,
      runManually: node.runManually,
      filters: node.filters,
      exposeExtension: node.exposeExtension,
      exposeMCP: node.exposeMCP,
      runAs: node.runAs,
      groupsAllowed: node.groupsAllowed,
      parameters: node.parameters,
      returnType: node.returnType,
      returnDescription: node.returnDescription,
      returnContentType: node.returnContentType,
    };
  }

  // === COMPATIBILITY ALIASES ===
  // These provide backward compatibility for existing code that expects ActionService and ExtService methods

  // ActionService compatibility
  get(ctx: AuthenticationContext, uuid: string) {
    return this.getAction(ctx, uuid);
  }

  list(ctx: AuthenticationContext) {
    return this.listActions(ctx);
  }

  createOrReplace(ctx: AuthenticationContext, file: File) {
    return this.createOrReplaceAction(ctx, file);
  }

  delete(ctx: AuthenticationContext, uuid: string) {
    return this.deleteAction(ctx, uuid);
  }

  run(
    ctx: AuthenticationContext,
    actionUuid: string,
    uuids: string[],
    params?: Record<string, unknown>,
  ) {
    return this.runAction(ctx, actionUuid, uuids, params);
  }

  export(ctx: AuthenticationContext, uuid: string) {
    return this.exportAction(ctx, uuid);
  }

  // ExtService compatibility - these methods use different signatures
  createOrReplaceExt(
    ctx: AuthenticationContext,
    file: File,
    metadata: { uuid?: string; title?: string; description?: string },
  ) {
    return this.createOrReplaceExtension(ctx, file, metadata);
  }

  getExt(uuid: string) {
    return this.getExtension(uuid);
  }

  updateExt(
    ctx: AuthenticationContext,
    uuid: string,
    metadata: { title?: string; description?: string; size?: number },
  ) {
    return this.updateExtension(ctx, uuid, metadata);
  }

  deleteExt(ctx: AuthenticationContext, uuid: string) {
    return this.deleteExtension(ctx, uuid);
  }

  listExt() {
    return this.listExtensions();
  }

  exportExt(uuid: string) {
    return this.exportExtension(uuid);
  }

  runExt(uuid: string, request: Request) {
    return this.runExtension(uuid, request);
  }
}

// Legacy type aliases for backward compatibility
export type ActionService = SkillService;
export type ExtService = SkillService;
export const ActionService = SkillService;
export const ExtService = SkillService;
