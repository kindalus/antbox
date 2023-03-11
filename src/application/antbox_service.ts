import { FolderNode, Node, Permission } from "/domain/nodes/node.ts";
import { NodeFilter } from "/domain/nodes/node_filter.ts";
import { Either, left, right } from "/shared/either.ts";
import { ActionService } from "./action_service.ts";
import { AspectService } from "./aspect_service.ts";
import { AuthContextProvider } from "./auth_provider.ts";
import { ExtService } from "./ext_service.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceContext } from "./node_service_context.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { AggregationFormulaError } from "../domain/nodes/aggregation_formula_error.ts";
import { SmartFolderNodeNotFoundError } from "../domain/nodes/smart_folder_node_not_found_error.ts";
import { SmartFolderNodeEvaluation } from "./smart_folder_evaluation.ts";
import { AuthService } from "./auth_service.ts";
import { ValidationError } from "../domain/nodes/validation_error.ts";
import { Action, SecureAspectService } from "../domain/actions/action.ts";
import { Aspect } from "../domain/aspects/aspect.ts";
import { User } from "../domain/auth/user.ts";
import { Group } from "../domain/auth/group.ts";
import { DomainEvents } from "./domain_events.ts";
import { NodeCreatedEvent } from "../domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "../domain/nodes/node_updated_event.ts";
import { NodeContentUpdatedEvent } from "../domain/nodes/node_content_updated_event.ts";
import { NodeDeletedEvent } from "../domain/nodes/node_deleted_event.ts";
import { NodeFilterResult } from "../domain/nodes/node_repository.ts";
import { AntboxError, ForbiddenError } from "../shared/antbox_error.ts";

export class AntboxService {
  static SYSTEM_FOLDER_UUID = "--system--";
  static TEMPLATES_FOLDER_UUID = "--templates--";

  private readonly nodeService: NodeService;
  private readonly authService: AuthService;
  private readonly aspectService: AspectService;
  private readonly actionService: ActionService;
  private readonly extService: ExtService;

  private started = false;

  constructor(nodeCtx: NodeServiceContext) {
    this.nodeService = new NodeService(nodeCtx);
    this.authService = new AuthService(this.nodeService);
    this.aspectService = new AspectService(this.nodeService);
    this.actionService = new ActionService(
      this.nodeService,
      this,
      this.toSecureAspectService()
    );

    this.extService = new ExtService(this.nodeService);

    this.start();
  }

  private toSecureAspectService(): SecureAspectService {
    return {
      get: (authCtx: AuthContextProvider, uuid: string) =>
        this.getAspect(authCtx, uuid),

      list: (authCtx: AuthContextProvider) => this.listAspects(authCtx),

      createOrReplace: (
        authCtx: AuthContextProvider,
        file: File,
        metadata: Partial<Node>
      ) => this.createFile(authCtx, file, metadata),
    };
  }

  createFile(
    authCtx: AuthContextProvider,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

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
          new NodeCreatedEvent(authCtx.getPrincipal(), result.value)
        );
      }

      return result;
    });
  }

  createMetanode(
    _authCtx: AuthContextProvider,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    if (AntboxService.isSystemFolder(metadata.parent!)) {
      return Promise.resolve(
        left(
          ValidationError.fromMsgs("Cannot create metanode in system folder")
        )
      );
    }

    return this.nodeService.createMetanode(metadata).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeCreatedEvent(_authCtx.getPrincipal(), result.value)
        );
      }

      return result;
    });
  }

  async createFolder(
    authCtx: AuthContextProvider,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>> {
    if (AntboxService.isSystemFolder(metadata.parent!)) {
      return left(
        ValidationError.fromMsgs("Cannot create folders in system folder")
      );
    }

    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
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
        new NodeCreatedEvent(authCtx.getPrincipal(), result.value)
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

    if (!this.started) {
      return left(new ServiceNotStartedError());
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
        ValidationError.fromMsgs("Cannot list children of non-folder node")
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
      principal.email !== User.ANONYMOUS_USER.email &&
      parent.permissions.authenticated.includes(permission)
    ) {
      return right(undefined);
    }

    return left(new ForbiddenError());
  }

  async get(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<ServiceNotStartedError | NodeNotFoundError, Node>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    const nodeOrErr = await this.nodeService.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const parentOrErr = await this.getParent(uuid);
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
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.query(filters, pageSize, pageToken);
  }

  update(
    authCtx: AuthContextProvider,
    uuid: string,
    metadata: Partial<Node>,
    merge?: boolean
  ): Promise<Either<AntboxError, void>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    if (AntboxService.isSystemFolder(uuid)) {
      return Promise.resolve(
        left(ValidationError.fromMsgs("Cannot update system folder"))
      );
    }

    return this.nodeService.update(uuid, metadata, merge).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeUpdatedEvent(authCtx.getPrincipal(), uuid, metadata)
        );
      }

      return result;
    });
  }

  export(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<ServiceNotStartedError | NodeNotFoundError, File>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.export(uuid);
  }

  copy(
    _authCtx: AuthContextProvider,
    uuid: string,
    parent: string
  ): Promise<Either<AntboxError, Node>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.copy(uuid, parent).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeCreatedEvent(_authCtx.getPrincipal(), result.value)
        );
      }

      return result;
    });
  }

  duplicate(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, Node>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    if (AntboxService.isSystemFolder(uuid)) {
      return Promise.resolve(
        left(ValidationError.fromMsgs("Cannot duplicate system folder"))
      );
    }

    return this.nodeService.duplicate(uuid);
  }

  updateFile(
    _authCtx: AuthContextProvider,
    uuid: string,
    file: File
  ): Promise<Either<AntboxError, void>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    if (AntboxService.isSystemFolder(uuid)) {
      return Promise.resolve(
        left(ValidationError.fromMsgs("Cannot update system folder"))
      );
    }

    return this.nodeService.updateFile(uuid, file).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeContentUpdatedEvent(_authCtx.getPrincipal(), uuid)
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
      | ServiceNotStartedError
      | SmartFolderNodeNotFoundError
      | AggregationFormulaError,
      SmartFolderNodeEvaluation
    >
  > {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.evaluate(uuid);
  }

  delete(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, void>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.delete(uuid).then((result) => {
      if (result.isRight()) {
        DomainEvents.notify(
          new NodeDeletedEvent(_authCtx.getPrincipal(), uuid)
        );
      }

      return result;
    });
  }

  getAction(_authCtx: AuthContextProvider, uuid: string) {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.actionService.get(uuid);
  }

  runAction(
    authCtx: AuthContextProvider,
    uuid: string,
    uuids: string[],
    params: Record<string, string>
  ) {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.actionService.run(authCtx.getPrincipal(), uuid, uuids, params);
  }

  listActions(
    _authCtx: AuthContextProvider
  ): Promise<Either<ServiceNotStartedError, Action[]>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.actionService.list().then((nodes) => right(nodes));
  }

  getAspect(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, Aspect>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.aspectService.get(uuid);
  }

  listAspects(
    _authCtx: AuthContextProvider
  ): Promise<Either<ServiceNotStartedError, Aspect[]>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.aspectService.list().then((nodes) => right(nodes));
  }

  runExtension(
    _authCtx: AuthContextProvider,
    uuid: string,
    request: Request
  ): Promise<Either<Error, Response>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.extService.run(uuid, request);
  }

  private processStartError(err: Error | ValidationError[]) {
    console.error(
      "Error starting Antbox service",
      JSON.stringify(err, null, 4)
    );

    Deno.exit(1);
  }

  private async start() {
    if (await this.systemFolderExists()) {
      this.started = true;
      return;
    }

    return this.createSystemFolder()
      .then(this.executeOrErr(() => this.createAspectsFolder()))
      .then(this.executeOrErr(() => this.createActionsFolder()))
      .then(this.executeOrErr(() => this.createExtensionsFolder()))
      .then(this.executeOrErr(() => this.createTemplatesFolder()))
      .then(this.executeOrErr(() => this.createAuthFoldersAndRootObjects()))
      .then(this.executeOrErr(() => this.createAccessTokensFolder()))
      .then((UnknownOrErr) => {
        if (UnknownOrErr.isLeft()) {
          return this.processStartError(UnknownOrErr.value);
        }

        this.subscribeToDomainEvents();
        this.started = true;
      });
  }

  private executeOrErr<T>(
    fn: () => Promise<Either<AntboxError, T>>
  ): <U>(r: Either<AntboxError, U>) => Promise<Either<AntboxError, T | U>> {
    return (r) => {
      if (r.isLeft()) {
        return Promise.resolve(r);
      }
      return fn();
    };
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

  private async createAuthFoldersAndRootObjects() {
    const folderOrErr = await this.createAuthFolders();
    if (folderOrErr.isLeft()) {
      return folderOrErr;
    }

    const userOrErr = await this.authService.createUser(User.ROOT_USER);
    if (userOrErr.isLeft()) {
      return userOrErr;
    }

    return this.authService.createGroup(Group.ADMIN_GROUP);
  }

  private async createAuthFolders() {
    const usersOrErr = await this.nodeService.createFolder({
      uuid: AuthService.USERS_FOLDER_UUID,
      fid: AuthService.USERS_FOLDER_UUID,
      title: "Users",
      parent: AntboxService.SYSTEM_FOLDER_UUID,
      group: Group.ADMIN_GROUP.uuid,
    });

    if (usersOrErr.isLeft()) {
      return usersOrErr;
    }

    return this.nodeService.createFolder({
      uuid: AuthService.GROUPS_FOLDER_UUID,
      fid: AuthService.GROUPS_FOLDER_UUID,
      title: "Groups",
      parent: AntboxService.SYSTEM_FOLDER_UUID,
      group: Group.ADMIN_GROUP.uuid,
    });
  }

  private createAccessTokensFolder() {
    return this.nodeService.createFolder(
      this.createSystemFolderMetadata(
        AuthService.ACCESS_TOKENS_FOLDER_UUID,
        AuthService.ACCESS_TOKENS_FOLDER_UUID,
        "Access Tokens",
        AntboxService.SYSTEM_FOLDER_UUID
      )
    );
  }

  private createTemplatesFolder() {
    return this.nodeService.createFolder(
      this.createSystemFolderMetadata(
        AntboxService.TEMPLATES_FOLDER_UUID,
        AntboxService.TEMPLATES_FOLDER_UUID,
        "Templates",
        AntboxService.SYSTEM_FOLDER_UUID
      )
    );
  }

  private createExtensionsFolder() {
    return this.nodeService.createFolder(
      this.createSystemFolderMetadata(
        ExtService.EXT_FOLDER_UUID,
        ExtService.EXT_FOLDER_UUID,
        "Extensions",
        AntboxService.SYSTEM_FOLDER_UUID
      )
    );
  }

  private createActionsFolder() {
    return this.nodeService.createFolder(
      this.createSystemFolderMetadata(
        ActionService.ACTIONS_FOLDER_UUID,
        ActionService.ACTIONS_FOLDER_UUID,
        "Actions",
        AntboxService.SYSTEM_FOLDER_UUID
      )
    );
  }

  private createAspectsFolder() {
    return this.nodeService.createFolder(
      this.createSystemFolderMetadata(
        AspectService.ASPECTS_FOLDER_UUID,
        AspectService.ASPECTS_FOLDER_UUID,
        "Aspects",
        AntboxService.SYSTEM_FOLDER_UUID
      )
    );
  }

  private createSystemFolder() {
    return this.nodeService.createFolder(
      this.createSystemFolderMetadata(
        AntboxService.SYSTEM_FOLDER_UUID,
        AntboxService.SYSTEM_FOLDER_UUID,
        "__System__",
        Node.ROOT_FOLDER_UUID
      )
    );
  }

  private createSystemFolderMetadata(
    uuid: string,
    fid: string,
    title: string,
    parent: string
  ) {
    return {
      uuid,
      fid,
      title,
      parent,
      owner: User.ROOT_USER.email,
      group: Group.ADMIN_GROUP.uuid,
    };
  }

  private systemFolderExists() {
    return this.nodeService
      .get(AntboxService.SYSTEM_FOLDER_UUID)

      .then((voidOrErr) => voidOrErr.isRight());
  }

  static isSystemFolder(uuid: string): boolean {
    return (
      uuid === AntboxService.SYSTEM_FOLDER_UUID ||
      AspectService.isAspectsFolder(uuid) ||
      ActionService.isActionsFolder(uuid) ||
      ExtService.isExtensionsFolder(uuid)
    );
  }
}

export class ServiceNotStartedError extends AntboxError {
  constructor() {
    super("ServiceNotStartedError", "Service not started");
  }
}
