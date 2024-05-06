import { AspectProperty } from "../domain/aspects/aspect.ts";
import { AspectNode } from "../domain/aspects/aspect_node.ts";
import { AggregationFormulaError } from "../domain/nodes/aggregation_formula_error.ts";
import { FolderNode } from "../domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeFilter } from "../domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { NodeFilterResult } from "../domain/nodes/node_repository.ts";
import { NodeSpec } from "../domain/nodes/node_spec.ts";
import {
  AggregationResult,
  Reducers,
  SmartFolderNodeEvaluation,
} from "../domain/nodes/smart_folder_evaluation.ts";
import {
  Aggregation,
  SmartFolderNode,
} from "../domain/nodes/smart_folder_node.ts";
import { SmartFolderNodeNotFoundError } from "../domain/nodes/smart_folder_node_not_found_error.ts";
import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { NodeDeleter } from "./node_deleter.ts";

import { NodeServiceContext } from "./node_service_context.ts";

/**
 * The `NodeService` class is responsible for managing raw nodes in the system.
 * It provides functionality for handling nodes without enforcing any specific rules
 * other than ensuring node integrity.
 *
 * Node integrity refers to the basic structural and data consistency of nodes, such as
 * ensuring they have the required properties and relationships.
 *
 * This class serves as a foundational service for working with nodes and can be used
 * in various parts of the application where raw nodes need to be manipulated or
 * processed.
 */
export class NodeService {
  constructor(private readonly context: NodeServiceContext) {}

  async createFile(
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>> {
    metadata.title = metadata.title ?? file.name;

    const validOrErr = await this.#verifyParent(metadata);
    if (validOrErr.isLeft()) {
      return left(validOrErr.value);
    }

    const uuid = metadata.uuid ?? this.context.uuidGenerator.generate();
    const fid =
      metadata.fid ??
      this.context.fidGenerator.generate(metadata.title ?? uuid);

    const node = NodeFactory.createMetadata(
      uuid,
      fid,
      metadata.mimetype ?? file.type,
      file.size,
      metadata
    );

    const trueOrErr = NodeSpec.isSatisfiedBy(node);
    if (trueOrErr.isLeft()) {
      return left(trueOrErr.value);
    }

    node.fulltext = await this.#calculateFulltext(node);

    let voidOrErr = await this.context.storage.write(node.uuid, file, {
      title: node.title,
      parent: node.parent,
      mimetype: node.mimetype,
    });
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    voidOrErr = await this.context.repository.add(node);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(node);
  }

  async #verifyParent(
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, true>> {
    if (!metadata.parent) {
      return left(new BadRequestError("parent is required"));
    }

    if (FolderNode.isSystemFolder(metadata.parent)) {
      return right(true);
    }

    const parentUuid = metadata.parent ?? Node.ROOT_FOLDER_UUID;
    const parentOrErr = await this.get(parentUuid);
    if (parentOrErr.isLeft()) {
      return left(new FolderNotFoundError(parentUuid));
    }

    return right(true);
  }

  async create(metadata: Partial<Node>): Promise<Either<AntboxError, Node>> {
    const validOrErr = await this.#verifyParent(metadata);
    if (validOrErr.isLeft()) {
      return left(validOrErr.value);
    }

    if (!metadata.mimetype) {
      return left(new BadRequestError("mimetype is required"));
    }

    const uuid = metadata.uuid ?? this.context.uuidGenerator.generate();
    const fid =
      metadata.fid ??
      this.context.fidGenerator.generate(metadata.title ?? uuid);
    const node = NodeFactory.createMetadata(
      uuid,
      fid,
      metadata.mimetype,
      0,
      metadata
    );

    const trueOrErr = NodeSpec.isSatisfiedBy(node);
    if (trueOrErr.isLeft()) {
      return left(trueOrErr.value);
    }

    node.fulltext = await this.#calculateFulltext(node);
    const addOrErr = await this.context.repository.add(node);

    if (addOrErr.isLeft()) {
      return left(addOrErr.value);
    }

    return right(node);
  }

  async duplicate(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
    const node = await this.get(uuid);

    if (node.isLeft()) {
      return left(node.value);
    }

    return this.copy(uuid, node.value.parent);
  }

  async copy(uuid: string, parent: string): Promise<Either<AntboxError, Node>> {
    const nodeOrErr = await this.get(uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (nodeOrErr.value.isFolder()) {
      return left(new BadRequestError("Cannot copy folder"));
    }

    const fileOrErr = await this.context.storage.read(uuid);
    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    const newUuid = this.context.uuidGenerator.generate();
    const title = `cópia de ${nodeOrErr.value.title}`;
    const fid = this.context.fidGenerator.generate(title);

    const newNode = NodeFactory.createMetadata(
      newUuid,
      fid,
      nodeOrErr.value.mimetype,
      nodeOrErr.value.size,
      { title, parent: parent ?? nodeOrErr.value.parent }
    );

    const writeOrErr = await this.context.storage.write(
      newNode.uuid,
      fileOrErr.value,
      {
        title: newNode.title,
        parent: newNode.parent,
        mimetype: newNode.mimetype,
      }
    );
    if (writeOrErr.isLeft()) {
      return left(writeOrErr.value);
    }

    newNode.fulltext = await this.#calculateFulltext(newNode);

    const addOrErr = await this.context.repository.add(newNode);
    if (addOrErr.isLeft()) {
      return left(addOrErr.value);
    }

    return right(newNode);
  }

  #escapeFulltext(fulltext: string): string {
    return fulltext
      .toLocaleLowerCase()
      .replace(/[áàâäãå]/g, "a")
      .replace(/[ç]/g, "c")
      .replace(/[éèêë]/g, "e")
      .replace(/[íìîï]/g, "i")
      .replace(/ñ/g, "n")
      .replace(/[óòôöõ]/g, "o")
      .replace(/[úùûü]/g, "u")
      .replace(/[ýÿ]/g, "y")
      .replace(/[\W\._]/g, " ")
      .replace(/(^|\s)\w{1,2}\s/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async #calculateFulltext(node: Node): Promise<string> {
    const aspects = await this.#getNodeAspects(node);

    const fulltext = aspects
      .map((a) => this.#aspectToProperties(a))
      .flat()
      .filter((p) => p.searchable)
      .map((p) => p.name)
      .map((p) => node.properties[p]);

    return this.#escapeFulltext(
      [node.title, node.description ?? "", ...fulltext].join(" ")
    );
  }

  #aspectToProperties(aspect: AspectNode): AspectProperty[] {
    return aspect.aspectProperties.map((p) => {
      return { ...p, name: `${aspect.uuid}:${p.name}` };
    });
  }

  async updateFile(
    uuid: string,
    file: File
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (nodeOrErr.value.isSmartFolder()) {
      const metadataText = await file.text();
      const metadata = JSON.parse(metadataText);
      return this.update(uuid, metadata);
    }

    nodeOrErr.value.modifiedTime = new Date().toISOString();
    nodeOrErr.value.size = file.size;
    nodeOrErr.value.mimetype = file.type;

    await this.context.storage.write(uuid, file, {
      title: nodeOrErr.value.title,
      parent: nodeOrErr.value.parent,
      mimetype: nodeOrErr.value.mimetype,
    });

    nodeOrErr.value.fulltext = await this.#calculateFulltext(nodeOrErr.value);
    await this.context.repository.update(nodeOrErr.value);

    return right(undefined);
  }

  async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrError = await this.get(uuid);

    if (nodeOrError.isLeft()) {
      return left(nodeOrError.value);
    }

    return NodeDeleter.for(nodeOrError.value, this.context).delete();
  }

  async get(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
    if (FolderNode.isRootFolder(uuid)) {
      return right(FolderNode.ROOT_FOLDER);
    }

    if (FolderNode.isSystemRootFolder(uuid)) {
      return right(FolderNode.SYSTEM_FOLDER);
    }

    const nodeOrErr = await this.getFromRepository(uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return right(nodeOrErr.value);
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
    parent = Node.ROOT_FOLDER_UUID
  ): Promise<Either<FolderNotFoundError, Node[]>> {
    if (FolderNode.isSystemRootFolder(parent)) {
      return right(this.#listSystemRootFolder());
    }

    const parentOrErr = await this.get(parent);
    if (parentOrErr.isLeft()) {
      return left(new FolderNotFoundError(parent));
    }

    const nodes = await this.context.repository
      .filter(
        [["parent", "==", parentOrErr.value.uuid]],
        Number.MAX_SAFE_INTEGER,
        1
      )
      .then((result) => result.nodes);

    if (parent === Node.ROOT_FOLDER_UUID) {
      return right([FolderNode.SYSTEM_FOLDER, ...nodes]);
    }

    return right(nodes);
  }

  #listSystemRootFolder(): FolderNode[] {
    return FolderNode.SYSTEM_FOLDERS;
  }

  query(
    filters: NodeFilter[],
    pageSize: number,
    pageToken = 1
  ): Promise<Either<AntboxError, NodeFilterResult>> {
    return this.context.repository
      .filter(filters, pageSize, pageToken)
      .then((v) => {
        const r = {
          nodes: v.nodes.map((n) => {
            if (n.isApikey()) {
              return n.cloneWithSecret();
            }

            return n;
          }),
          pageToken: v.pageToken,
          pageCount: v.pageCount,
          pageSize: v.pageSize,
        };
        return right(r);
      });
  }

  async update(
    uuid: string,
    data: Partial<Node>,
    merge = false
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (nodeOrErr.value.isApikey()) {
      return left(new BadRequestError("Cannot update apikey"));
    }

    const newNode = merge
      ? this.#merge(nodeOrErr.value, data)
      : Object.assign(nodeOrErr.value, data);

    newNode.modifiedTime = new Date().toISOString();

    newNode.fulltext = await this.#calculateFulltext(newNode);
    return this.context.repository.update(newNode);
  }

  async #getNodeAspects(node: Node): Promise<AspectNode[]> {
    if (!node.aspects || node.aspects.length === 0) {
      return [];
    }

    const nodesOrErrs = await Promise.all(node.aspects.map((a) => this.get(a)));

    return nodesOrErrs
      .filter((nodeOrErr) => nodeOrErr.isRight())
      .map((nodeOrErr) => nodeOrErr.value as AspectNode);
  }

  #merge<T>(dst: T, src: Partial<T>): T {
    const proto = Object.getPrototypeOf(dst);
    const result = Object.assign(Object.create(proto), dst);

    for (const key in src) {
      if (!src[key] && src[key] !== 0 && src[key] !== false) {
        delete result[key];
        continue;
      }

      if (typeof src[key] === "object") {
        // deno-lint-ignore no-explicit-any
        result[key] = this.#merge(result[key] ?? {}, src[key] as any);
        continue;
      }

      result[key] = src[key];
    }

    return result;
  }

  async evaluate(
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
      .filter(node.filters, Number.MAX_SAFE_INTEGER, 1)
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

  async export(uuid: string): Promise<Either<NodeNotFoundError, File>> {
    const nodeOrErr = await this.get(uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const node = nodeOrErr.value;

    const fileOrErr = await this.context.storage.read(uuid);
    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    const type = this.#mapAntboxMimetypes(node.mimetype);
    const file = new File([fileOrErr.value], node.title, { type });

    return right(file);
  }

  #mapAntboxMimetypes(mimetype: string): string {
    const mimetypeMap = {
      [Node.ACTION_MIMETYPE]: "application/javascript",
      [Node.ASPECT_MIMETYPE]: "application/json",
      [Node.EXT_MIMETYPE]: "application/javascript",
      [Node.SMART_FOLDER_MIMETYPE]: "application/json",
    };

    return mimetypeMap[mimetype] ?? mimetype;
  }

  #exportSmartfolder(node: SmartFolderNode): File {
    const { title, filters, aggregations } = node;
    const jsonText = JSON.stringify({ title, filters, aggregations }, null, 2);

    return new File([jsonText], node.title.concat(".json"), {
      type: "application/json",
    });
  }
}
