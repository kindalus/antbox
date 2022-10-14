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

import { DefaultFidGenerator } from "/strategies/default_fid_generator.ts";
import { DefaultUuidGenerator } from "/strategies/default_uuid_generator.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { NodeCreatedEvent } from "/domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "/domain/nodes/node_deleted_event.ts";
import { NodeFilter } from "/domain/nodes/node_filter.ts";
import { Either, left, right } from "/shared/either.ts";
import { NodeUpdatedEvent } from "../domain/nodes/node_updated_event.ts";
import { NodeDeleter } from "./node_deleter.ts";
import {
  AggregationResult,
  Reducers,
  SmartFolderNodeEvaluation,
} from "./smart_folder_evaluation.ts";
import { NodeServiceContext } from "./node_service_context.ts";
import { ValidationError } from "../domain/nodes/validation_error.ts";

export class NodeService {
  private readonly context: NodeServiceContext;

  constructor(context: NodeServiceContext) {
    this.context = {
      fidGenerator: context.fidGenerator ?? new DefaultFidGenerator(),
      uuidGenerator: context.uuidGenerator ?? new DefaultUuidGenerator(),
      storage: context.storage,
      repository: context.repository,
    };
  }

  async createFile(
    principal: UserPrincipal,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], string>> {
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

    await this.context.storage.write(node.uuid, file);
    await this.context.repository.add(node);

    DomainEvents.notify(new NodeCreatedEvent(node));

    return right(node.uuid);
  }

  private async verifyTitleAndParent(
    principal: UserPrincipal,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], void>> {
    if (!metadata.title) {
      return left([new ValidationError("title")]);
    }

    const parent = metadata.parent ?? Node.ROOT_FOLDER_UUID;
    const folderExists = await this.folderExistsInRepo(principal, parent);

    if (!folderExists) {
      return left(new FolderNotFoundError(parent));
    }

    return right(undefined);
  }

  private extractMetadataFields(metadata: Partial<Node>): Partial<Node> {
    return {
      parent: metadata.parent,
      title: metadata.title,
      starred: metadata.starred ?? false,
      trashed: metadata.trashed ?? false,
      aspects: metadata.aspects ?? [],
      description: metadata.description ?? "",
      properties: metadata.properties ?? {},
    };
  }

  private async tryToCreateSmartfolder(
    pricipal: UserPrincipal,
    file: File,
    metadata: Partial<Node>
  ): Promise<SmartFolderNode | undefined> {
    try {
      const content = new TextDecoder().decode(await file.arrayBuffer());
      const json = JSON.parse(content);

      const node = NodeFactory.fromJson(json) as SmartFolderNode;

      if (!node.isSmartFolder()) {
        return undefined;
      }

      NodeFactory.composeSmartFolder(
        metadata,
        this.createFileMetadata(pricipal, metadata, node.mimetype, 0),
        { filters: node.filters, aggregations: node.aggregations }
      );
    } catch (_e) {
      return undefined;
    }
  }

  async createFolder(
    principal: UserPrincipal,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], string>> {
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
        mimetype,
        owner: principal.username,
        size,
      },
      this.extractMetadataFields(metadata)
    ) as FileNode;
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

  async copy(
    principal: UserPrincipal,
    uuid: string
  ): Promise<Either<NodeNotFoundError, string>> {
    const node = await this.get(principal, uuid);
    const file = await this.context.storage.read(uuid);

    if (node.isLeft()) {
      return left(node.value);
    }

    const newNode = this.createFileMetadata(
      principal,
      node.value,
      node.value.mimetype,
      node.value.size
    );

    await this.context.storage.write(newNode.uuid, file);
    await this.context.repository.add(newNode);

    DomainEvents.notify(new NodeCreatedEvent(newNode));

    return Promise.resolve(right(newNode.uuid));
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

  get(
    _principal: UserPrincipal,
    uuid: string
  ): Promise<Either<NodeNotFoundError, Node>> {
    return this.getFromRepository(uuid);
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
    const exists = await this.folderExistsInRepo(principal, parent);
    if (!exists) {
      return left(new FolderNotFoundError(parent));
    }

    const nodes = await this.context.repository
      .filter([["parent", "==", parent]], Number.MAX_VALUE, 1)
      .then((result) => result.nodes);

    return right(nodes);
  }

  folderExistsInRepo(principal: UserPrincipal, uuid: string): Promise<boolean> {
    if (Node.isRootFolder(uuid)) {
      return Promise.resolve(true);
    }

    return this.get(principal, uuid).then(
      (result) => result.isRight() && result.value.isFolder()
    );
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
