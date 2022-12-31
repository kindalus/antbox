import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";
import { Node } from "/domain/nodes/node.ts";
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
import { Action } from "../domain/actions/action.ts";
import { Aspect } from "../domain/aspects/aspect.ts";

export class AntboxService {
  static SYSTEM_FOLDER_UUID = "--system--";

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
      this.aspectService
    );

    this.extService = new ExtService(this.nodeService);

    this.start();
  }

  createFile(
    _authCtx: AuthContextProvider,
    file: File,
    metadata: Partial<Node>
  ) {
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

    return this.nodeService.createFile(file, metadata);
  }

  createMetanode(_authCtx: AuthContextProvider, metadata: Partial<Node>) {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    if (AntboxService.isSystemFolder(metadata.parent!)) {
      return Promise.resolve(
        left([new ValidationError("Cannot create metanode in system folder")])
      );
    }

    return this.nodeService.createMetanode(metadata);
  }

  createFolder(_authCtx: AuthContextProvider, metadata: Partial<Node>) {
    if (AntboxService.isSystemFolder(metadata.parent!)) {
      return Promise.resolve(
        left([new ValidationError("Cannot create metanode in system folder")])
      );
    }

    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.createFolder(metadata);
  }

  list(
    _authCtx: AuthContextProvider,
    uuid?: string
  ): Promise<Either<ServiceNotStartedError | FolderNotFoundError, Node[]>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.list(uuid);
  }

  get(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<ServiceNotStartedError | NodeNotFoundError, Node>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.get(uuid);
  }

  query(
    _authCtx: AuthContextProvider,
    filters: NodeFilter[],
    pageSize = 25,
    pageToken = 1
  ) {
    Promise<
      Either<
        SmartFolderNodeNotFoundError | AggregationFormulaError,
        SmartFolderNodeEvaluation
      >
    >;
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.query(filters, pageSize, pageToken);
  }

  update(_authCtx: AuthContextProvider, uuid: string, metadata: Partial<Node>) {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    if (AntboxService.isSystemFolder(uuid)) {
      return Promise.resolve(
        left([new ValidationError("Cannot update system folder")])
      );
    }

    return this.nodeService.update(uuid, metadata);
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

  copy(_authCtx: AuthContextProvider, uuid: string, parent: string) {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.copy(uuid, parent);
  }

  duplicate(_authCtx: AuthContextProvider, uuid: string) {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    if (AntboxService.isSystemFolder(uuid)) {
      return Promise.resolve(
        left([new ValidationError("Cannot duplicate system folder")])
      );
    }

    return this.nodeService.duplicate(uuid);
  }

  updateFile(_authCtx: AuthContextProvider, uuid: string, file: File) {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    if (AntboxService.isSystemFolder(uuid)) {
      return Promise.resolve(
        left([new ValidationError("Cannot update system folder")])
      );
    }

    return this.nodeService.updateFile(uuid, file);
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

  delete(_authCtx: AuthContextProvider, uuid: string) {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.nodeService.delete(uuid);
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

    const principalOrErr = authCtx.getPrincipal();
    if (principalOrErr.isLeft()) {
      return Promise.resolve(left(principalOrErr.value));
    }

    return this.actionService.run(principalOrErr.value, uuid, uuids, params);
  }

  listActions(
    _authCtx: AuthContextProvider
  ): Promise<Either<ServiceNotStartedError, Action[]>> {
    if (!this.started) {
      return Promise.resolve(left(new ServiceNotStartedError()));
    }

    return this.actionService.list().then((nodes) => right(nodes));
  }

  getAspect(_authCtx: AuthContextProvider, uuid: string) {
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

  private processStartError(_err: Error | ValidationError[]) {}

  private async start() {
    if (await this.systemFolderExists()) {
      this.started = true;
      return;
    }

    const voidOrErr = await this.createSystemFolder();

    if (voidOrErr.isLeft()) {
      return this.processStartError(voidOrErr.value);
    }

    this.createAspectsFolder();
    this.createActionsFolder();
    this.createExtensionsFolder();
    this.createAuthFolders();

    this.subscribeToDomainEvents();

    this.started = true;
  }

  private subscribeToDomainEvents() {
    // DomainEvents.subscribe(NodeCreatedEvent.EVENT_ID, {
    //   handle: (evt) => this.runOnCreateScritps(evt as NodeCreatedEvent),
    // });
    // DomainEvents.subscribe(NodeUpdatedEvent.EVENT_ID, {
    //   handle: (evt) => this.runOnUpdatedScritps(evt as NodeUpdatedEvent),
    // });
    // DomainEvents.subscribe(NodeCreatedEvent.EVENT_ID, {
    //   handle: (evt) => this.runAutomaticActionsForCreates(evt as NodeCreatedEvent),
    // });
    // DomainEvents.subscribe(NodeUpdatedEvent.EVENT_ID, {
    //   handle: (evt) => this.runAutomaticActionsForUpdates(evt as NodeUpdatedEvent),
    // });
  }

  private createAuthFolders() {
    return Promise.all([
      this.nodeService.createFolder({
        uuid: AuthService.USERS_FOLDER_UUID,
        fid: AuthService.USERS_FOLDER_UUID,
        title: "Users",
        parent: AntboxService.SYSTEM_FOLDER_UUID,
      }),
      this.nodeService.createFolder({
        uuid: AuthService.GROUPS_FOLDER_UUID,
        fid: AuthService.GROUPS_FOLDER_UUID,
        title: "Groups",
        parent: AntboxService.SYSTEM_FOLDER_UUID,
      }),
    ]);
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
    const systemUser = this.authService.getSystemUser();

    return {
      uuid,
      fid,
      title,
      parent,
      owner: systemUser.username,
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

export class ServiceNotStartedError extends Error {
  constructor() {
    super("Service not started");
  }
}
