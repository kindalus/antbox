import { ActionService } from "/application/action_service.ts";
import { builtinAspects } from "./builtin_aspects/index.ts";
import { AggregationFormulaError } from "/domain/nodes/aggregation_formula_error.ts";
import { NodeFactory } from "/domain/nodes/node_factory.ts";
import { NodeContentUpdatedEvent } from "/domain/nodes/node_content_updated_event.ts";
import { DomainEvents } from "/application/domain_events.ts";
import { NodeFilterResult } from "/domain/nodes/node_repository.ts";

import { FileNode, FolderNode, Node } from "/domain/nodes/node.ts";

import {
  Aggregation,
  SmartFolderNode,
} from "/domain/nodes/smart_folder_node.ts";

import { FolderNotFoundError } from "/domain/nodes/folder_not_found_error.ts";
import { SmartFolderNodeNotFoundError } from "/domain/nodes/smart_folder_node_not_found_error.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";

import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { NodeCreatedEvent } from "/domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "/domain/nodes/node_deleted_event.ts";
import { NodeFilter } from "/domain/nodes/node_filter.ts";
import { Either, left, right } from "/shared/either.ts";
import { NodeUpdatedEvent } from "/domain/nodes/node_updated_event.ts";
import { NodeDeleter } from "/application/node_deleter.ts";
import {
  AggregationResult,
  Reducers,
  SmartFolderNodeEvaluation,
} from "./smart_folder_evaluation.ts";
import { NodeServiceContext } from "./node_service_context.ts";
import { ValidationError } from "../domain/nodes/validation_error.ts";
import { builtinActions } from "./builtin_actions/index.ts";
import { AspectService } from "./aspect_service.ts";
import { Action } from "../domain/actions/action.ts";
import { Aspect } from "../domain/aspects/aspect.ts";

export class NodeService {
  constructor(private readonly context: NodeServiceContext) {
    this.bootstrap();
  }

  private async bootstrap() {
    const systemFolder = await this.getFromRepository(Node.SYSTEM_FOLDER_UUID);

    if (systemFolder.isRight()) {
      return;
    }

    const systemUser = this.context.authService.getSystemUser();

    const folderMetadata = this.createFolderMetadata(systemUser, {
      title: "__System__",
    });

    await this.context.repository.add(
      NodeFactory.composeFolder({
        ...folderMetadata,
        uuid: Node.SYSTEM_FOLDER_UUID,
        parent: Node.ROOT_FOLDER_UUID,
      })
    );

    await this.context.repository.add(
      NodeFactory.composeFolder({
        ...folderMetadata,
        uuid: Node.ASPECTS_FOLDER_UUID,
        parent: Node.SYSTEM_FOLDER_UUID,
        title: "Aspects",
      })
    );

    await this.context.repository.add(
      NodeFactory.composeFolder({
        ...folderMetadata,
        uuid: Node.ACTIONS_FOLDER_UUID,
        parent: Node.SYSTEM_FOLDER_UUID,
        title: "Actions",
      })
    );

    await this.context.repository.add(
      NodeFactory.composeFolder({
        ...folderMetadata,
        uuid: Node.EXT_FOLDER_UUID,
        parent: Node.SYSTEM_FOLDER_UUID,
        title: "Extensions",
      })
    );
  }

  async createFile(
    principal: UserPrincipal,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], void>> {
    if (Node.isSystemFolder(metadata.parent!)) {
      return this.createSystemFile(principal, file, metadata);
    }

    metadata.title = metadata.title ?? file.name;

    const validOrErr = await this.verifyTitleAndParent(principal, metadata);
    if (validOrErr.isLeft()) {
      return left(validOrErr.value);
    }

    let node: FileNode | SmartFolderNode | undefined;
    if (file.type === "application/json") {
      node = await this.tryToCreateSmartfolder(principal, file, metadata);
    }

    if (!node) {
      node = this.createFileMetadata(principal, metadata, file.type, file.size);
    }

    const validationErrors = await node.validate(() => Promise.resolve([]));

    if (validationErrors.length > 0) {
      return left(validationErrors);
    }

    if (!node.isSmartFolder()) {
      await this.context.storage.write(node.uuid, file);
    }

    await this.context.repository.add(node);

    DomainEvents.notify(new NodeCreatedEvent(node));

    return right(undefined);
  }

  private createSystemFile(
    principal: UserPrincipal,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], void>> {
    if (metadata?.parent === Node.ASPECTS_FOLDER_UUID) {
      return this.createAspect(principal, file, metadata);
    }

    if (metadata?.parent === Node.ACTIONS_FOLDER_UUID) {
      return this.createAction(principal, file, metadata);
    }

    if (metadata?.parent === Node.EXT_FOLDER_UUID) {
      return this.createExt(principal, file, metadata);
    }

    return Promise.resolve(
      left([new ValidationError("Invalid parent folder")])
    );
  }

  private async createExt(
    principal: UserPrincipal,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], void>> {
    if (!this.isJavascript(file)) {
      return left([new ValidationError("File must be a javascript file")]);
    }

    const fileNode = this.createFileMetadata(
      principal,
      {
        title: file.name?.split(".")[0] ?? metadata.uuid,
        parent: Node.EXT_FOLDER_UUID,
      },
      file.type,
      file.size
    );

    fileNode.uuid = file.name?.split(".")[0] ?? metadata.uuid;
    fileNode.fid = fileNode.uuid;

    await this.context.storage.write(fileNode.uuid, file);
    await this.context.repository.add(fileNode);

    return right(undefined);
  }

  private isJavascript(file: File) {
    return (
      file.type === "application/javascript" || file.type === "text/javascript"
    );
  }

  private async createAction(
    principal: UserPrincipal,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], void>> {
    if (!this.isJavascript(file)) {
      return left([new ValidationError("File must be a javascript file")]);
    }

    const fileNode = this.createFileMetadata(
      principal,
      metadata,
      file.type,
      file.size
    );
    const action = await ActionService.fileToAction(file);

    fileNode.uuid = action.uuid;
    fileNode.title = action.title;
    fileNode.fid = action.uuid;

    await this.context.storage.write(
      fileNode.uuid,
      await ActionService.actionToFile(action)
    );
    await this.context.repository.add(fileNode);

    return right(undefined);
  }

  private async createAspect(
    principal: UserPrincipal,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], undefined>> {
    if (file.type !== "application/json") {
      return left([new ValidationError("File must be a json file")]);
    }

    const fileNode = this.createFileMetadata(
      principal,
      metadata,
      file.type,
      file.size
    );

    const aspect = (await file.text().then((t) => JSON.parse(t))) as Aspect;

    fileNode.uuid = aspect.uuid;
    fileNode.title = aspect.title;
    fileNode.fid = aspect.uuid;

    await this.context.storage.write(fileNode.uuid, file);
    await this.context.repository.add(fileNode);

    return right(undefined);
  }

  private async verifyTitleAndParent(
    principal: UserPrincipal,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], void>> {
    if (!metadata.title) {
      return left([new ValidationError("title")]);
    }

    const parent = metadata.parent ?? Node.ROOT_FOLDER_UUID;
    const folderExists = await this.getFolderIfExistsInRepo(principal, parent);

    if (!folderExists) {
      return left(new FolderNotFoundError(parent));
    }

    return right(undefined);
  }

  private extractMetadataFields(metadata: Partial<Node>): Partial<Node> {
    return {
      parent: metadata.parent,
      title: metadata.title,
      aspects: metadata.aspects ?? [],
      description: metadata.description ?? "",
      properties: metadata.properties ?? {},
    };
  }

  private async tryToCreateSmartfolder(
    principal: UserPrincipal,
    file: File,
    metadata: Partial<Node>
  ): Promise<SmartFolderNode | undefined> {
    try {
      const content = new TextDecoder().decode(await file.arrayBuffer());
      const json = JSON.parse(content);

      if (json.mimetype !== Node.SMART_FOLDER_MIMETYPE) {
        return undefined;
      }

      return NodeFactory.composeSmartFolder(
        {
          uuid: this.context.uuidGenerator!.generate(),
          fid: this.context.fidGenerator!.generate(metadata.title!),
          owner: principal.username,
          size: 0,
        },
        this.extractMetadataFields(metadata),
        {
          filters: json.filters,
          aggregations: json.aggregations,
          title: json.title,
        }
      );
    } catch (_e) {
      return undefined;
    }
  }

  async createFolder(
    principal: UserPrincipal,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], string>> {
    if (Node.isSystemFolder(metadata.parent!)) {
      return left([
        new ValidationError("Cannot create metanode in system folder"),
      ]);
    }

    const validOrErr = await this.verifyTitleAndParent(principal, metadata);
    if (validOrErr.isLeft()) {
      return left(validOrErr.value);
    }
    const node = this.createFolderMetadata(principal, metadata);

    const validationErrors = await node.validate(() => Promise.resolve([]));

    if (validationErrors.length > 0) {
      return left(validationErrors);
    }

    await this.context.repository.add(node);

    DomainEvents.notify(new NodeCreatedEvent(node));

    return right(node.uuid);
  }

  async createMetanode(
    principal: UserPrincipal,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], string>> {
    if (Node.isSystemFolder(metadata.parent!)) {
      return left([
        new ValidationError("Cannot create metanode in system folder"),
      ]);
    }

    const validOrErr = await this.verifyTitleAndParent(principal, metadata);
    if (validOrErr.isLeft()) {
      return left(validOrErr.value);
    }

    const node = this.createFileMetadata(
      principal,
      metadata,
      Node.META_NODE_MIMETYPE,
      0
    );

    const validationErrors = await node.validate(() => Promise.resolve([]));
    if (validationErrors.length > 0) {
      return left(validationErrors);
    }

    await this.context.repository.add(node);

    DomainEvents.notify(new NodeCreatedEvent(node));

    return right(node.uuid);
  }

  private createFileMetadata(
    principal: UserPrincipal,
    metadata: Partial<Node>,
    mimetype: string,
    size: number
  ): FileNode {
    return NodeFactory.composeNode(
      {
        uuid: this.context.uuidGenerator!.generate(),
        fid: this.context.fidGenerator!.generate(metadata.title!),
        mimetype:
          mimetype === "text/javascript" ? "application/javascript" : mimetype,
        owner: principal.username,
        size,
      },
      this.extractMetadataFields(metadata)
    ) as FileNode;
  }

  private createSmartfolderMetadata() {
    return this.createMetanode;
  }

  private createFolderMetadata(
    principal: UserPrincipal,
    metadata: Partial<Node>
  ): FolderNode {
    return NodeFactory.composeFolder(
      {
        uuid: this.context.uuidGenerator!.generate(),
        fid: this.context.fidGenerator!.generate(metadata.title!),
        mimetype: Node.FOLDER_MIMETYPE,
        owner: principal.username,
        size: 0,
      },
      this.extractMetadataFields(metadata)
    );
  }

  async duplicate(
    principal: UserPrincipal,
    uuid: string
  ): Promise<Either<NodeNotFoundError, void>> {
    const node = await this.get(principal, uuid);

    if (node.isLeft()) {
      return left(node.value);
    }

    return this.copy(principal, uuid, node.value.parent);
  }

  async copy(
    principal: UserPrincipal,
    uuid: string,
    parent: string
  ): Promise<Either<NodeNotFoundError, void>> {
    const node = await this.get(principal, uuid);
    const file = await this.context.storage.read(uuid);

    if (node.isLeft()) {
      return left(node.value);
    }

    const newNode = this.createFileMetadata(
      principal,
      {
        ...node.value,
        parent,
      },
      node.value.mimetype,
      node.value.size
    );

    await this.context.storage.write(newNode.uuid, file);
    await this.context.repository.add(newNode);

    DomainEvents.notify(new NodeCreatedEvent(newNode));

    return right(undefined);
  }

  async updateFile(
    principal: UserPrincipal,
    uuid: string,
    file: File
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(principal, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    nodeOrErr.value.modifiedTime = this.now();
    nodeOrErr.value.size = file.size;
    nodeOrErr.value.mimetype = file.type;

    await this.context.storage.write(uuid, file);

    await this.context.repository.update(nodeOrErr.value);

    DomainEvents.notify(new NodeContentUpdatedEvent(uuid));

    return right(undefined);
  }

  async delete(
    principal: UserPrincipal,
    uuid: string
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrError = await this.get(principal, uuid);

    if (nodeOrError.isLeft()) {
      return left(nodeOrError.value);
    }

    await NodeDeleter.for(nodeOrError.value, this.context).delete();
    DomainEvents.notify(new NodeDeletedEvent(uuid));

    return right(undefined);
  }

  async get(
    _principal: UserPrincipal,
    uuid: string
  ): Promise<Either<NodeNotFoundError, Node>> {
    const builtinActionOrErr = await this.getBuiltinAction(uuid);
    if (builtinActionOrErr.isRight()) {
      return right(builtinActionOrErr.value);
    }

    const builtinAspectOrErr = await this.getBuiltinAspect(uuid);
    if (builtinAspectOrErr.isRight()) {
      return right(builtinAspectOrErr.value);
    }

    return this.getFromRepository(uuid);
  }

  private getBuiltinAction(
    uuid: string
  ): Promise<Either<NodeNotFoundError, Node>> {
    const action = builtinActions.find((a) => a.uuid === uuid);

    if (!action) {
      return Promise.resolve(left(new NodeNotFoundError(uuid)));
    }

    return Promise.resolve(right(this.builtinActionToNode(action)));
  }

  private getBuiltinAspect(
    uuid: string
  ): Promise<Either<NodeNotFoundError, Node>> {
    const aspect = builtinAspects.find((a) => a.uuid === uuid);

    if (!aspect) {
      return Promise.resolve(left(new NodeNotFoundError(uuid)));
    }

    return Promise.resolve(right(this.builtinAspectToNode(aspect)));
  }

  private getFromRepository(
    uuid: string
  ): Promise<Either<NodeNotFoundError, Node>> {
    if (Node.isFid(uuid)) {
      return this.context.repository.getByFid(Node.uuidToFid(uuid));
    }
    return this.context.repository.getById(uuid);
  }

  async list(
    principal: UserPrincipal,
    parent = Node.ROOT_FOLDER_UUID
  ): Promise<Either<FolderNotFoundError, Node[]>> {
    const folderOrUndefined = await this.getFolderIfExistsInRepo(
      principal,
      parent
    );
    if (folderOrUndefined.isLeft()) {
      return left(new FolderNotFoundError(parent));
    }

    const nodes = await this.context.repository
      .filter(
        [["parent", "==", folderOrUndefined.value.uuid]],
        Number.MAX_VALUE,
        1
      )
      .then((result) => result.nodes);

    if (parent === Node.ACTIONS_FOLDER_UUID) {
      return right(this.listActions(nodes));
    }

    if (parent === Node.ASPECTS_FOLDER_UUID) {
      return right(this.listAspects(nodes));
    }

    return right(nodes);
  }

  private listActions(nodes: Node[]): Node[] {
    const actions = builtinActions.map((a) => this.builtinActionToNode(a));

    return [...nodes, ...actions];
  }

  private builtinActionToNode(action: Action): Node {
    return {
      uuid: action.uuid,
      fid: action.uuid,
      title: action.title,
      mimetype: "application/javascript",
      size: 0,
      parent: Node.ACTIONS_FOLDER_UUID,
      owner: this.context.authService.getSystemUser().username,
      createdTime: this.now(),
      modifiedTime: this.now(),
    } as Node;
  }

  private listAspects(nodes: Node[]): Node[] {
    const aspects = builtinAspects.map((a) => this.builtinAspectToNode(a));

    return [...nodes, ...aspects];
  }

  private builtinAspectToNode(aspect: Aspect): Node {
    return {
      uuid: aspect.uuid,
      fid: aspect.uuid,
      title: aspect.title,
      mimetype: "application/json",
      size: 0,
      parent: Node.ASPECTS_FOLDER_UUID,
      owner: this.context.authService.getSystemUser().username,
      createdTime: this.now(),
      modifiedTime: this.now(),
    } as Node;
  }

  getFolderIfExistsInRepo(
    principal: UserPrincipal,
    uuid: string
  ): Promise<Either<void, FolderNode>> {
    if (Node.isRootFolder(uuid)) {
      return Promise.resolve(right(Node.rootFolder()));
    }

    return this.get(principal, uuid).then((result) => {
      if (result.isRight() && result.value.isFolder()) {
        return right(result.value);
      }

      return left(undefined);
    });
  }

  query(
    _principal: UserPrincipal,
    filters: NodeFilter[],
    pageSize = 25,
    pageToken = 1
  ): Promise<NodeFilterResult> {
    return this.context.repository.filter(filters, pageSize, pageToken);
  }

  async update(
    principal: UserPrincipal,
    uuid: string,
    data: Partial<Node>,
    merge = false
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(principal, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const newNode = merge
      ? this.merge(nodeOrErr.value, data)
      : Object.assign(nodeOrErr.value, data);

    const voidOrErr = await this.context.repository.update(newNode);

    if (voidOrErr.isRight()) {
      DomainEvents.notify(new NodeUpdatedEvent(uuid, data));
    }

    return voidOrErr;
  }

  private merge<T>(dst: T, src: Partial<T>): T {
    const proto = Object.getPrototypeOf(dst);
    const result = Object.assign(Object.create(proto), dst);

    for (const key in src) {
      if (!src[key] && src[key] !== 0 && src[key] !== false) {
        delete result[key];
        continue;
      }

      if (typeof src[key] === "object") {
        // deno-lint-ignore no-explicit-any
        result[key] = this.merge(result[key] ?? {}, src[key] as any);
        continue;
      }

      result[key] = src[key];
    }

    return result;
  }

  async evaluate(
    _principal: UserPrincipal,
    uuid: string
  ): Promise<
    Either<
      SmartFolderNodeNotFoundError | AggregationFormulaError,
      SmartFolderNodeEvaluation
    >
  > {
    const nodeOrErr = await this.context.repository.getById(uuid);

    if (nodeOrErr.isLeft()) {
      return left(new SmartFolderNodeNotFoundError(uuid));
    }

    if (!nodeOrErr.value.isSmartFolder()) {
      return left(new SmartFolderNodeNotFoundError(uuid));
    }

    const node = nodeOrErr.value;

    const evaluation = await this.context.repository
      .filter(node.filters, Number.MAX_VALUE, 1)
      .then((filtered) => ({ records: filtered.nodes }));

    if (node.hasAggregations()) {
      return this.appendAggregations(evaluation, node.aggregations!);
    }

    return right(evaluation);
  }

  private appendAggregations(
    evaluation: SmartFolderNodeEvaluation,
    aggregations: Aggregation[]
  ): Either<AggregationFormulaError, SmartFolderNodeEvaluation> {
    const aggregationsMap = aggregations.map((aggregation) => {
      const formula = Reducers[aggregation.formula as string];

      if (!formula) {
        left(new AggregationFormulaError(aggregation.formula));
      }

      return right({
        title: aggregation.title,
        value: formula(evaluation.records as Node[], aggregation.fieldName),
      });
    });

    const err = aggregationsMap.find((aggregation) => aggregation.isLeft());

    if (err) {
      return left(err.value as AggregationFormulaError);
    }

    return right({
      ...evaluation,
      aggregations: aggregationsMap.map(
        (aggregation) => aggregation.value as AggregationResult
      ),
    });
  }

  async export(
    principal: UserPrincipal,
    uuid: string
  ): Promise<Either<NodeNotFoundError, File>> {
    const builtinActionOrErr = await this.exportBuiltinAction(uuid);
    if (builtinActionOrErr.isRight()) {
      return builtinActionOrErr;
    }

    const builtinAspectOrErr = await this.exportBuiltinAspect(uuid);
    if (builtinAspectOrErr.isRight()) {
      return builtinAspectOrErr;
    }

    const nodeOrErr = await this.get(principal, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (nodeOrErr.value.isSmartFolder()) {
      return right(this.exportSmartfolder(nodeOrErr.value));
    }

    const file = await this.context.storage.read(uuid);

    return right(file);
  }

  private exportBuiltinAction(
    uuid: string
  ): Promise<Either<NodeNotFoundError, File>> {
    const action = builtinActions.find((action) => action.uuid === uuid);

    if (!action) {
      return Promise.resolve(left(new NodeNotFoundError(uuid)));
    }

    return ActionService.actionToFile(action).then((file) => right(file));
  }

  private exportBuiltinAspect(
    uuid: string
  ): Promise<Either<NodeNotFoundError, File>> {
    const aspect = builtinAspects.find((aspect) => aspect.uuid === uuid);

    if (!aspect) {
      return Promise.resolve(left(new NodeNotFoundError(uuid)));
    }

    return AspectService.aspectToFile(aspect).then((file) => right(file));
  }

  private exportSmartfolder(node: Node): File {
    const jsonText = JSON.stringify(node);

    return new File([jsonText], node.title.concat(".json"), {
      type: "application/json",
    });
  }

  private now() {
    return new Date().toISOString();
  }
}
