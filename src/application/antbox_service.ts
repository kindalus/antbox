import { Action } from "../domain/actions/action.ts";
import { Aspect } from "../domain/aspects/aspect.ts";
import { AuthContextProvider } from "../domain/auth/auth_provider.ts";
import { Group } from "../domain/auth/group.ts";
import { User } from "../domain/auth/user.ts";
import { AggregationFormulaError } from "../domain/nodes/aggregation_formula_error.ts";
import { FolderNode } from "../domain/nodes/folder_node.ts";
import { Node, Permission } from "../domain/nodes/node.ts";
import { NodeContentUpdatedEvent } from "../domain/nodes/node_content_updated_event.ts";
import { NodeCreatedEvent } from "../domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "../domain/nodes/node_deleted_event.ts";
import { NodeFilter } from "../domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { NodeFilterResult } from "../domain/nodes/node_repository.ts";
import { NodeUpdatedEvent } from "../domain/nodes/node_updated_event.ts";
import { SmartFolderNodeEvaluation } from "../domain/nodes/smart_folder_evaluation.ts";
import { SmartFolderNodeNotFoundError } from "../domain/nodes/smart_folder_node_not_found_error.ts";
import {
  AntboxError,
  BadRequestError,
  ForbiddenError,
} from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { ActionService } from "./action_service.ts";
import { AspectService } from "./aspect_service.ts";
import { AuthService } from "./auth_service.ts";
import { DomainEvents } from "./domain_events.ts";
import { ExtService } from "./ext_service.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceContext } from "./node_service_context.ts";

export class AntboxService {
  readonly nodeService: NodeService;
  readonly authService: AuthService;
  readonly aspectService: AspectService;
  readonly actionService: ActionService;
  readonly extService: ExtService;

  constructor(nodeCtx: NodeServiceContext) {
    this.nodeService = new NodeService(nodeCtx);
    this.authService = new AuthService(this.nodeService);
    this.aspectService = new AspectService(this.nodeService);
    this.actionService = new ActionService(this.nodeService, this);

    this.extService = new ExtService(this.nodeService);

    this.subscribeToDomainEvents();
  }

  createFile(
    authCtx: AuthContextProvider,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>> {
    if (ActionService.isActionsFolder(metadata.parent!)) {
      return this.actionService.createOrReplace(file, metadata);
    }

    if (AspectService.isAspectsFolder(metadata.parent!)) {
      return this.aspectService.createOrReplace(file, metadata);
    }

    if (ExtService.isExtensionsFolder(metadata.parent!)) {
      return this.extService.createOrReplace(file, metadata);
    }

    return this.nodeService.createFile(file, metadata).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeCreatedEvent(authCtx.getPrincipal().email, result.value)
        );
      }

      return result;
    });
  }

  createMetanode(
    _authCtx: AuthContextProvider,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>> {
    if (AntboxService.isSystemFolder(metadata.parent!)) {
      return Promise.resolve(
        left(new BadRequestError("Cannot create metanode in system folder"))
      );
    }

    return this.nodeService.createMetanode(metadata).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeCreatedEvent(_authCtx.getPrincipal().email, result.value)
        );
      }

      return result;
    });
  }

  async createFolder(
    authCtx: AuthContextProvider,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, FolderNode>> {
    if (AntboxService.isSystemFolder(metadata.parent!)) {
      return left(
        new BadRequestError("Cannot create folders in system folder")
      );
    }

    const parentOrErr = await this.getParent(metadata.parent);
    if (parentOrErr.isLeft()) {
      return left(parentOrErr.value);
    }

    const voidOrErr = await this.assertUserCanWrite(authCtx, parentOrErr.value);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    const result = await this.nodeService.createFolder({
      ...metadata,
      owner: authCtx.getPrincipal().email,
      group: authCtx.getPrincipal().group,
      permissions: {
        ...parentOrErr.value.permissions,
      },
    });

    if (result.isRight()) {
      DomainEvents.notify(
        new NodeCreatedEvent(authCtx.getPrincipal().email, result.value)
      );
    }

    return result;
  }

  async list(
    authCtx: AuthContextProvider,
    uuid = Node.ROOT_FOLDER_UUID
  ): Promise<Either<AntboxError, Node[]>> {
    const parentOrErr = await this.getParent(uuid);
    if (parentOrErr.isLeft()) {
      return left(parentOrErr.value);
    }

    const voidOrErr = await this.assertUserCanRead(authCtx, parentOrErr.value);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return this.nodeService.list(uuid);
  }

  private async getParent(
    uuid = Node.ROOT_FOLDER_UUID
  ): Promise<Either<AntboxError, FolderNode>> {
    const parentOrErr = await this.nodeService.get(uuid);
    if (parentOrErr.isLeft()) {
      return left(parentOrErr.value);
    }

    if (!parentOrErr.value.isFolder()) {
      return left(
        new BadRequestError("Cannot list children of non-folder node")
      );
    }

    return right(parentOrErr.value);
  }

  private assertUserCanRead(
    authCtx: AuthContextProvider,
    parent: FolderNode
  ): Either<AntboxError, void> {
    return this.assertPermission(authCtx, parent, "Read");
  }

  private assertUserCanWrite(
    authCtx: AuthContextProvider,
    parent: FolderNode
  ): Either<AntboxError, void> {
    return this.assertPermission(authCtx, parent, "Write");
  }

  private assertPermission(
    authCtx: AuthContextProvider,
    parent: FolderNode,
    permission: Permission
  ): Either<AntboxError, void> {
    const principal = authCtx.getPrincipal();

    if (User.isAdmin(principal as User)) {
      return right(undefined);
    }

    if (parent.isRootFolder() && permission === "Read") {
      return right(undefined);
    }

    if (parent.isRootFolder() && !User.isAdmin(principal as User)) {
      return left(new ForbiddenError());
    }

    if (parent.owner === authCtx.getPrincipal().email) {
      return right(undefined);
    }

    if (parent.permissions.anonymous.includes(permission)) {
      return right(undefined);
    }

    if (
      principal.groups.includes(parent.group) &&
      parent.permissions.group.includes(permission)
    ) {
      return right(undefined);
    }

    if (
      principal.email !== User.ANONYMOUS_USER_EMAIL &&
      parent.permissions.authenticated.includes(permission)
    ) {
      return right(undefined);
    }

    return left(new ForbiddenError());
  }

  async get(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<NodeNotFoundError, Node>> {
    const nodeOrErr = await this.nodeService.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const parentOrErr = await this.getParent(nodeOrErr.value.parent);
    if (parentOrErr.isLeft()) {
      return left(parentOrErr.value);
    }

    const voidOrErr = await this.assertUserCanRead(_authCtx, parentOrErr.value);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return nodeOrErr;
  }

  query(
    _authCtx: AuthContextProvider,
    filters: NodeFilter[],
    pageSize = 25,
    pageToken = 1
  ): Promise<Either<AntboxError, NodeFilterResult>> {
    return this.nodeService.query(filters, pageSize, pageToken);
  }

  update(
    authCtx: AuthContextProvider,
    uuid: string,
    metadata: Partial<Node>,
    merge?: boolean
  ): Promise<Either<AntboxError, void>> {
    if (AntboxService.isSystemFolder(uuid)) {
      return Promise.resolve(
        left(new BadRequestError("Cannot update system folder"))
      );
    }

    return this.nodeService.update(uuid, metadata, merge).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeUpdatedEvent(authCtx.getPrincipal().email, uuid, metadata)
        );
      }

      return result;
    });
  }

  export(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<NodeNotFoundError, File>> {
    return this.nodeService.export(uuid);
  }

  copy(
    _authCtx: AuthContextProvider,
    uuid: string,
    parent: string
  ): Promise<Either<AntboxError, Node>> {
    return this.nodeService.copy(uuid, parent).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeCreatedEvent(_authCtx.getPrincipal().email, result.value)
        );
      }

      return result;
    });
  }

  duplicate(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, Node>> {
    if (AntboxService.isSystemFolder(uuid)) {
      return Promise.resolve(
        left(new BadRequestError("Cannot duplicate system folder"))
      );
    }

    return this.nodeService.duplicate(uuid);
  }

  updateFile(
    _authCtx: AuthContextProvider,
    uuid: string,
    file: File
  ): Promise<Either<AntboxError, void>> {
    if (AntboxService.isSystemFolder(uuid)) {
      return Promise.resolve(
        left(new BadRequestError("Cannot update system folder"))
      );
    }

    return this.nodeService.updateFile(uuid, file).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeContentUpdatedEvent(_authCtx.getPrincipal().email, uuid)
        );
      }

      return result;
    });
  }

  evaluate(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<
    Either<
      SmartFolderNodeNotFoundError | AggregationFormulaError,
      SmartFolderNodeEvaluation
    >
  > {
    return this.nodeService.evaluate(uuid);
  }

  delete(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, void>> {
    return this.nodeService.delete(uuid).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeDeletedEvent(_authCtx.getPrincipal().email, uuid)
        );
      }

      return result;
    });
  }

  getAction(_authCtx: AuthContextProvider, uuid: string) {
    return this.actionService.get(uuid);
  }

  runAction(
    authCtx: AuthContextProvider,
    uuid: string,
    uuids: string[],
    params: Record<string, string>
  ) {
    return this.actionService.run(authCtx.getPrincipal(), uuid, uuids, params);
  }

  listActions(_authCtx: AuthContextProvider): Promise<Action[]> {
    return this.actionService.list().then((nodes) => nodes);
  }

  getAspect(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, Aspect>> {
    return this.aspectService.get(uuid);
  }

  listAspects(_authCtx: AuthContextProvider): Promise<Aspect[]> {
    return this.aspectService.list().then((nodes) => nodes);
  }

  runExtension(
    _authCtx: AuthContextProvider,
    uuid: string,
    request: Request
  ): Promise<Either<Error, Response>> {
    return this.extService.run(uuid, request);
  }

  private subscribeToDomainEvents() {
    DomainEvents.subscribe(NodeCreatedEvent.EVENT_ID, {
      handle: (evt) =>
        this.actionService.runOnCreateScritps(evt as NodeCreatedEvent),
    });
    DomainEvents.subscribe(NodeUpdatedEvent.EVENT_ID, {
      handle: (evt) =>
        this.actionService.runOnUpdatedScritps(evt as NodeUpdatedEvent),
    });
    DomainEvents.subscribe(NodeCreatedEvent.EVENT_ID, {
      handle: (evt) =>
        this.actionService.runAutomaticActionsForCreates(
          evt as NodeCreatedEvent
        ),
    });
    DomainEvents.subscribe(NodeUpdatedEvent.EVENT_ID, {
      handle: (evt) =>
        this.actionService.runAutomaticActionsForUpdates(
          evt as NodeUpdatedEvent
        ),
    });
  }

  private async createAuthFolders() {
    const usersOrErr = await this.nodeService.createFolder({
      uuid: Node.USERS_FOLDER_UUID,
      fid: Node.USERS_FOLDER_UUID,
      title: "Users",
      parent: Node.SYSTEM_FOLDER_UUID,
      group: Group.ADMINS_GROUP_UUID,
    });

    if (usersOrErr.isLeft()) {
      return usersOrErr;
    }

    return this.nodeService.createFolder({
      uuid: Node.GROUPS_FOLDER_UUID,
      fid: Node.GROUPS_FOLDER_UUID,
      title: "Groups",
      parent: Node.SYSTEM_FOLDER_UUID,
      group: Group.ADMINS_GROUP_UUID,
    });
  }

  static isSystemFolder(uuid: string): boolean {
    return (
      uuid === Node.SYSTEM_FOLDER_UUID ||
      AspectService.isAspectsFolder(uuid) ||
      ActionService.isActionsFolder(uuid) ||
      ExtService.isExtensionsFolder(uuid)
    );
  }
}
