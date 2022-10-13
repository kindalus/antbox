import { AggregationFormulaError } from "/domain/nodes/aggregation_formula_error.ts";
import { NodeFactory } from "/domain/nodes/node_factory.ts";
import { NodeContentUpdatedEvent } from "/domain/nodes/node_content_updated_event.ts";
import { DomainEvents } from "/application/domain_events.ts";
import { FidGenerator } from "/domain/nodes/fid_generator.ts";
import {
  NodeRepository,
  NodeFilterResult,
} from "/domain/nodes/node_repository.ts";
import { StorageProvider } from "/domain/providers/storage_provider.ts";
import { UuidGenerator } from "/domain/providers/uuid_generator.ts";

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

export interface NodeServiceContext {
  readonly fidGenerator?: FidGenerator;
  readonly uuidGenerator?: UuidGenerator;
  readonly storage: StorageProvider;
  readonly repository: NodeRepository;
}

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
    parent = Node.ROOT_FOLDER_UUID
  ): Promise<Either<FolderNotFoundError, string>> {
    let node: Node | undefined;

    const folderExists = await this.folderExistsInRepo(principal, parent);

    if (!folderExists) {
      return left(new FolderNotFoundError(parent));
    }

    if (file.type === "application/json") {
      node = await this.tryToCreateSmartfolder(principal, file, parent);
    }

    if (!node) {
      node = this.createFileMetadata(
        principal,
        parent,
        file.name,
        file.type,
        file.size
      );
      await this.context.storage.write(node.uuid, file);
    }

    await this.context.repository.add(node);

    DomainEvents.notify(new NodeCreatedEvent(node));

    return Promise.resolve(right(node.uuid));
  }

  private async tryToCreateSmartfolder(
    pricipal: UserPrincipal,
    file: File,
    parent: string
  ): Promise<SmartFolderNode | undefined> {
    try {
      const content = new TextDecoder().decode(await file.arrayBuffer());
      const json = JSON.parse(content);

      const node = NodeFactory.fromJson(json) as SmartFolderNode;

      if (!node.isSmartFolder()) {
        return undefined;
      }

      NodeFactory.composeSmartFolder(
        this.createFileMetadata(pricipal, parent, node.title, node.mimetype, 0),
        { filters: node.filters, aggregations: node.aggregations }
      );
    } catch (_e) {
      return undefined;
    }
  }

  async createFolder(
    principal: UserPrincipal,
    title: string,
    parent = Node.ROOT_FOLDER_UUID
  ): Promise<string> {
    const node = this.createFolderMetadata(principal, parent, title);

    await this.context.repository.add(node);

    DomainEvents.notify(new NodeCreatedEvent(node));

    return node.uuid;
  }

  async createMetanode(
    principal: UserPrincipal,
    title: string,
    parent = Node.ROOT_FOLDER_UUID
  ): Promise<string> {
    const node = this.createFileMetadata(
      principal,
      parent,
      title,
      Node.META_NODE_MIMETYPE,
      0
    );

    await this.context.repository.add(node);

    DomainEvents.notify(new NodeCreatedEvent(node));

    return node.uuid;
  }

  private createFileMetadata(
    principal: UserPrincipal,
    parent: string,
    title: string,
    mimetype: string,
    size: number
  ): FileNode {
    return Object.assign(new FileNode(), {
      uuid: this.context.uuidGenerator!.generate(),
      fid: this.context.fidGenerator!.generate(title),
      title,
      parent,
      mimetype,
      owner: principal.username,
      starred: false,
      trashed: false,
      size,
      createdTime: now(),
      modifiedTime: now(),
    });
  }

  private createFolderMetadata(
    principal: UserPrincipal,
    parent: string,
    title: string
  ): FolderNode {
    return NodeFactory.composeFolder(
      this.createFileMetadata(principal, parent, title, Node.FOLDER_MIMETYPE, 0)
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
      node.value.parent ?? Node.ROOT_FOLDER_UUID,
      node.value.title,
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

    nodeOrErr.value.modifiedTime = now();
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
}

abstract class NodeDeleter<T extends Node> {
  static for(node: Node, context: NodeServiceContext): NodeDeleter<Node> {
    if (node.isFolder()) {
      return new FolderNodeDeleter(node as FolderNode, context);
    }

    if (node.isSmartFolder()) {
      return new SmartFolderNodeDeleter(node as SmartFolderNode, context);
    }

    if (node.isMetaNode()) {
      return new MetaNodeDeleter(node as Node, context);
    }

    return new FileNodeDeleter(node as FileNode, context);
  }

  protected readonly node: T;
  protected readonly context: NodeServiceContext;

  protected constructor(node: T, context: NodeServiceContext) {
    this.node = node;
    this.context = context;
  }

  abstract delete(): Promise<Either<NodeNotFoundError, void>>;

  protected deleteFromRepository(): Promise<Either<NodeNotFoundError, void>> {
    return this.context.repository.delete(this.node.uuid);
  }

  protected deleteFromStorage(): Promise<void> {
    return this.context.storage.delete(this.node.uuid);
  }
}

class MetaNodeDeleter extends NodeDeleter<Node> {
  constructor(node: Node, context: NodeServiceContext) {
    super(node, context);
  }

  delete(): Promise<Either<NodeNotFoundError, void>> {
    return this.deleteFromRepository();
  }
}

class FileNodeDeleter extends NodeDeleter<FileNode> {
  constructor(node: FileNode, context: NodeServiceContext) {
    super(node, context);
  }

  delete(): Promise<Either<NodeNotFoundError, void>> {
    return this.deleteFromStorage().then(() => this.deleteFromRepository());
  }
}

class FolderNodeDeleter extends NodeDeleter<FolderNode> {
  constructor(node: FolderNode, context: NodeServiceContext) {
    super(node, context);
  }

  async delete(): Promise<Either<NodeNotFoundError, void>> {
    await this.deleteChildren();
    return this.deleteFromRepository();
  }

  private async deleteChildren() {
    const { nodes: children } = await this.context.repository.filter(
      [["parent", "==", this.node.uuid]],
      Number.MAX_VALUE,
      1
    );

    for (const child of children) {
      await NodeDeleter.for(child, this.context).delete();
    }
  }
}

class SmartFolderNodeDeleter extends NodeDeleter<SmartFolderNode> {
  delete(): Promise<Either<NodeNotFoundError, void>> {
    return this.deleteFromRepository();
  }
  constructor(node: SmartFolderNode, context: NodeServiceContext) {
    super(node, context);
  }
}

function now() {
  return new Date().toISOString();
}

type AggregatorFn<T> = (acc: T, curValue: unknown) => T;
type ReducerFn = (nodes: Node[], fieldName: string) => unknown;

function calculateAggregation<T>(
  fn: AggregatorFn<T>,
  initialValue: T,
  nodes: Node[],
  field: string
): T {
  // deno-lint-ignore no-explicit-any
  return nodes.reduce((acc, node: any) => {
    const value = node[field] ?? node.properties?.[field];

    if (!value) throw "field not found " + field;

    return fn(acc, value);
  }, initialValue);
}

const Reducers: Record<string, ReducerFn> = {
  sum(nodes: Node[], fieldName: string) {
    const fn = (acc: number, curValue: number) => acc + (curValue as number);
    return calculateAggregation(
      fn as AggregatorFn<unknown>,
      0,
      nodes,
      fieldName
    );
  },

  avg(nodes: Node[], fieldName: string) {
    const fn = ((acc: number, curValue: number) =>
      acc + (curValue as number)) as AggregatorFn<unknown>;

    const sum = calculateAggregation(fn, 0, nodes, fieldName);

    return (sum as number) / nodes.length;
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  count(nodes: Node[], _fieldName: string) {
    return nodes.length;
  },

  max(nodes: Node[], fieldName: string) {
    const fn = (acc: number, curValue: number) =>
      acc > curValue ? acc : curValue;
    return calculateAggregation(
      fn as AggregatorFn<unknown>,
      undefined,
      nodes,
      fieldName
    );
  },

  min(nodes: Node[], fieldName: string) {
    const fn = (acc: number, curValue: number) =>
      acc < curValue ? acc : curValue;
    return calculateAggregation(
      fn as AggregatorFn<unknown>,
      undefined,
      nodes,
      fieldName
    );
  },

  // deno-lint-ignore no-explicit-any
  med(nodes: any[], fieldName: string) {
    const values = nodes
      .map((node) => node[fieldName] ?? node.properties?.[fieldName])
      .sort(<T>(a: T, b: T) => (a > b ? 1 : -1));

    if (values.length === 0) return undefined;

    return values[Math.floor(values.length / 2)];
  },
};

export interface SmartFolderNodeEvaluation {
  records: Node[];
  aggregations?: AggregationResult[];
}

export type AggregationResult = {
  title: string;
  value: unknown;
};
