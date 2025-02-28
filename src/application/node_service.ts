import { type AspectProperty } from "domain/aspects/aspect.ts";
import { AspectNode } from "domain/aspects/aspect_node.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "domain/nodes/folder_not_found_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { MetaNode } from "domain/nodes/meta_node.ts";
import { Node } from "domain/nodes/node.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { FileLikeNode, NodeLike } from "domain/nodes/node_like.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { NodeFilterResult } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { type SmartFolderNodeEvaluation } from "domain/nodes/smart_folder_evaluation.ts";
import { SmartFolderNode } from "domain/nodes/smart_folder_node.ts";
import { SmartFolderNodeNotFoundError } from "domain/nodes/smart_folder_node_not_found_error.ts";
import { AntboxError, BadRequestError, ForbiddenError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { isPrincipalAllowedTo } from "./is_principal_allowed_to.ts";
import { type AuthenticationContext } from "./authentication_context.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { NodeFactory } from "domain/node_factory.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { FidGenerator } from "shared/fid_generator.ts";
import { builtinFolders, SYSTEM_FOLDER, SYSTEM_FOLDERS } from "./builtin_folders/index.ts";
import { areFiltersSatisfiedBy } from "domain/nodes/node_filters.ts";

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

  async copy(
    ctx: AuthenticationContext,
    uuid: string,
    parent: string,
  ): Promise<Either<AntboxError, Node>> {
    const nodeOrErr = await this.get(ctx, uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (Nodes.isFolder(nodeOrErr.value)) {
      return left(new BadRequestError("Cannot copy folder"));
    }

    const metadata = {
      ...nodeOrErr.value.metadata,
      uuid: UuidGenerator.generate(),
      title: `${nodeOrErr.value.title} 2`,
      parent,
    };

    delete metadata.fid;

    if (!Nodes.isFileLike(nodeOrErr.value)) {
      return this.create(ctx, metadata);
    }

    const fileOrErr = await this.context.storage.read(uuid);
    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    return this.createFile(ctx, fileOrErr.value, metadata);
  }

  async create(
    ctx: AuthenticationContext,
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, NodeLike>> {
    const uuid = metadata.uuid ?? UuidGenerator.generate();
    const nodeOrErr = NodeFactory.from({
      ...metadata,

      uuid,
      fid: metadata.fid ?? FidGenerator.generate(metadata.title!),
      owner: ctx.principal.email,
      group: ctx.principal.groups[0],
    });

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const parentOrErr = await this.#getBuiltinFolderOrFromRepository(nodeOrErr.value.parent);
    if (parentOrErr.isLeft()) {
      return left(parentOrErr.value);
    }

    const isAllowed = isPrincipalAllowedTo(ctx, parentOrErr.value, "Write");
    if (!isAllowed) {
      return left(new ForbiddenError());
    }

    const filtersSatisfied = areFiltersSatisfiedBy(parentOrErr.value.filters, nodeOrErr.value);
    if (!filtersSatisfied) {
      return left(new BadRequestError("Node does not satisfy parent filters"));
    }

    if (Nodes.isFolder(nodeOrErr.value) && !metadata.permissions) {
      nodeOrErr.value.update({ permissions: parentOrErr.value.permissions });
    }

    nodeOrErr.value.update({ fulltext: await this.#calculateFulltext(ctx, nodeOrErr.value) });

    const voidOrErr = await this.context.repository.add(nodeOrErr.value);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(nodeOrErr.value);
  }

  async createFile(
    ctx: AuthenticationContext,
    file: File,
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, FileLikeNode>> {
    const useFileType =
      !metadata.mimetype ||
      ![Nodes.EXT_MIMETYPE, Nodes.ACTION_MIMETYPE].includes(metadata.mimetype);

    const nodeOrErr = await this.create(ctx, {
      ...metadata,
      title: metadata.title ?? file.name,
      fid: metadata.fid ?? FidGenerator.generate(metadata.title ?? file.name),
      mimetype: useFileType ? file.type : metadata.mimetype,
      size: file.size,
    });

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const node = nodeOrErr.value as FileLikeNode;

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

  async delete(ctx: AuthenticationContext, uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.#getFromRepository(uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const parentOrErr = await this.#getBuiltinFolderOrFromRepository(nodeOrErr.value.parent);
    if (parentOrErr.isLeft()) {
      return left(new UnknownError(`Parent folder not found for node uuid='${uuid}'`));
    }

    const isAllowed = isPrincipalAllowedTo(ctx, parentOrErr.value, "Write");
    if (!isAllowed) {
      return left(new ForbiddenError());
    }

    if (Nodes.isFileLike(nodeOrErr.value)) {
      const voidOrErr = await this.context.storage.delete(uuid);
      if (voidOrErr.isLeft()) {
        return left(voidOrErr.value);
      }
    }

    if (!Nodes.isFolder(nodeOrErr.value)) {
      return this.context.repository.delete(uuid);
    }

    const children = await this.context.repository.filter([["parent", "==", uuid]]);
    const batch = children.nodes.map((n) => this.delete(ctx, n.uuid));
    const batchResult = await Promise.allSettled(batch);

    const rejected = batchResult.filter((r) => r.status === "rejected");
    if (rejected.length > 0) {
      return left(new UnknownError(`Error deleting children: ${rejected.map((r) => r.reason)}`));
    }

    return this.context.repository.delete(uuid);
  }

  async duplicate(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError, Node>> {
    const nodeOrErr = await this.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (Nodes.isFolder(nodeOrErr.value)) {
      return left(new BadRequestError("Cannot duplicate folder"));
    }

    const metadata = {
      ...nodeOrErr.value.metadata,
      uuid: UuidGenerator.generate(),
      title: `${nodeOrErr.value.title} 2`,
    };

    delete metadata.fid;

    if (!Nodes.isFileLike(nodeOrErr.value)) {
      return this.create(ctx, metadata);
    }

    const fileOrErr = await this.context.storage.read(uuid);
    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    return this.createFile(ctx, fileOrErr.value, metadata);
  }

  async export(ctx: AuthenticationContext, uuid: string): Promise<Either<NodeNotFoundError, File>> {
    const nodeOrErr = await this.#getFromRepository(uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const parentOrErr = await this.#getBuiltinFolderOrFromRepository(nodeOrErr.value.parent);
    if (parentOrErr.isLeft()) {
      return left(new UnknownError(`Parent folder not found for node uuid='${uuid}'`));
    }

    const isAllowed = isPrincipalAllowedTo(ctx, parentOrErr.value, "Export");
    if (!isAllowed) {
      return left(new ForbiddenError());
    }

    const fileOrErr = await this.context.storage.read(uuid);
    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    const type = this.#mapAntboxMimetypes(nodeOrErr.value.mimetype);
    const file = new File([fileOrErr.value], nodeOrErr.value.title, { type });

    return right(file);
  }

  async evaluate(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<SmartFolderNodeNotFoundError, SmartFolderNodeEvaluation>> {
    const nodeOrErr = await this.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(new SmartFolderNodeNotFoundError(uuid));
    }

    if (!Nodes.isSmartFolder(nodeOrErr.value)) {
      return left(new SmartFolderNodeNotFoundError(uuid));
    }

    const node: SmartFolderNode = nodeOrErr.value;

    const evaluation = await this.context.repository
      .filter(node.filters, Number.MAX_SAFE_INTEGER, 1)
      .then((filtered) => ({ records: filtered.nodes }));

    return right(evaluation);
  }

  async find(
    ctx: AuthenticationContext,
    filters: NodeFilters,
    pageSize = 20,
    pageToken = 1,
  ): Promise<Either<AntboxError, NodeFilterResult>> {
    if (!filters.some((f) => f[0].startsWith("@"))) {
      return this.#findAll(filters);
    }

    const atfiltersOrErr = await this.#processAtFilters(filters);

    if (atfiltersOrErr.isLeft()) {
      return right({
        nodes: [],
        pageSize,
        pageToken,
      });
    }

    const nodesOrErr = await this.#findAll(atfiltersOrErr.value);
    if (nodesOrErr.isLeft()) {
      return nodesOrErr;
    }

    const allowedNodes = nodesOrErr.value.nodes.filter(async (n) =>
      isPrincipalAllowedTo(ctx, this, n, "Read"),
    );

    return right({
      nodes: allowedNodes.slice((pageToken - 1) * pageSize, pageToken * pageSize),
      pageSize,
      pageToken,
    });
  }

  async get(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError, NodeLike>> {
    const nodeOrErr = await this.#getBuiltinNodeOrFromRepository(uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (Nodes.isFolder(nodeOrErr.value)) {
      return isPrincipalAllowedTo(ctx, nodeOrErr.value, "Read")
        ? right(nodeOrErr.value)
        : left(new ForbiddenError());
    }

    const parentOrErr = await this.#getBuiltinFolderOrFromRepository(nodeOrErr.value.parent);
    if (parentOrErr.isLeft()) {
      return left(
        new UnknownError(
          `Parent folder uuid='${nodeOrErr.value.parent}' not found for node uuid='${uuid}' `,
        ),
      );
    }

    return isPrincipalAllowedTo(ctx, parentOrErr.value, "Read")
      ? right(nodeOrErr.value)
      : left(new ForbiddenError());
  }

  async list(
    ctx: AuthenticationContext,
    parent = Folders.ROOT_FOLDER_UUID,
  ): Promise<Either<FolderNotFoundError | ForbiddenError, NodeLike[]>> {
    if (parent === Folders.SYSTEM_FOLDER_UUID) {
      return right(SYSTEM_FOLDERS);
    }

    const parentOrErr = await this.#getBuiltinFolderOrFromRepository(parent);
    if (parentOrErr.isLeft()) {
      return left(parentOrErr.value);
    }

    const isAllowed = isPrincipalAllowedTo(ctx, parentOrErr.value, "Read");
    if (!isAllowed) {
      return left(new ForbiddenError());
    }

    if (Folders.isSystemRootFolder(parentOrErr.value)) {
      return right(this.#listSystemRootFolder());
    }

    const nodesOrErr = await this.find(
      ctx,
      [["parent", "==", parentOrErr.value.uuid]],
      Number.MAX_SAFE_INTEGER,
      1,
    );

    if (nodesOrErr.isLeft()) {
      return left(nodesOrErr.value);
    }

    const nodes = nodesOrErr.value.nodes;

    if (parent === Folders.ROOT_FOLDER_UUID) {
      nodes.push(SYSTEM_FOLDER);
    }

    return right(
      nodes.filter((n) => {
        if (!Nodes.isFolder(n)) return true;

        return isPrincipalAllowedTo(ctx, n, "Read");
      }),
    );
  }

  async update(
    ctx: AuthenticationContext,
    uuid: string,
    data: Partial<NodeMetadata>,
  ): Promise<Either<NodeNotFoundError, void>> {
    let nodeOrErr = await this.get(ctx, uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (Nodes.isApikey(nodeOrErr.value)) {
      return left(new BadRequestError("Cannot update apikey"));
    }

    if (Nodes.isFileLike(nodeOrErr.value)) {
      nodeOrErr = NodeFactory.from({ ...nodeOrErr.value.metadata, size: data.size });
      if (nodeOrErr.isLeft()) {
        return left(nodeOrErr.value);
      }
    }

    const voidOrErr = nodeOrErr.value.update(data);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    nodeOrErr.value.update({ fulltext: await this.#calculateFulltext(ctx, nodeOrErr.value) });

    const parentOrErr = Nodes.isFolder(nodeOrErr.value)
      ? right<AntboxError, FolderNode>(nodeOrErr.value)
      : await this.#getBuiltinFolderOrFromRepository(nodeOrErr.value.parent);

    if (parentOrErr.isLeft()) {
      return left(new UnknownError(`Parent folder not found for node uuid='${uuid}'`));
    }

    const allowed = isPrincipalAllowedTo(ctx, parentOrErr.value, "Write");
    if (!allowed) {
      return left(new ForbiddenError());
    }

    return this.context.repository.update(nodeOrErr.value);
  }

  async updateFile(
    ctx: AuthenticationContext,
    uuid: string,
    file: File,
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(ctx, uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isFileLike(nodeOrErr.value)) {
      return left(new NodeNotFoundError(uuid));
    }

    if (nodeOrErr.value.mimetype !== file.type) {
      return left(new BadRequestError("Mimetype mismatch"));
    }

    await this.context.storage.write(uuid, file, {
      title: nodeOrErr.value.title,
      parent: nodeOrErr.value.parent,
      mimetype: nodeOrErr.value.mimetype,
    });

    return this.update(ctx, uuid, { size: file.size });
  }

  async #calculateFulltext(ctx: AuthenticationContext, node: NodeLike): Promise<string> {
    const fulltext = [node.title, node.description ?? ""];

    if ((Nodes.isFileLike(node) || Nodes.isFolder(node)) && node.tags?.length) {
      fulltext.push(...node.tags);
    }

    if (Nodes.hasAspects(node)) {
      const aspects = await this.#getNodeAspects(ctx, node);

      const propertiesFulltext: string[] = aspects
        .map((a) => this.#aspectToProperties(a))
        .flat()
        .filter((p) => p.searchable)
        .map((p) => p.name)
        .map((p) => node.properties[p] as string);

      fulltext.push(...propertiesFulltext);
    }

    return fulltext
      .join(" ")
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

  async #findAll(filters: NodeFilters): Promise<Either<AntboxError, NodeFilterResult>> {
    const v = await this.context.repository.filter(filters, Number.MAX_SAFE_INTEGER, 1);

    const r = {
      nodes: v.nodes.map((n) => (Nodes.isApikey(n) ? n.cloneWithSecret() : n)),
      pageToken: v.pageToken,
      pageSize: v.pageSize,
    };

    return right(r);
  }

  async #getBuiltinFolderOrFromRepository(
    uuid: string,
  ): Promise<Either<NodeNotFoundError, FolderNode>> {
    const key = Nodes.isFid(uuid) ? Nodes.uuidToFid(uuid) : uuid;
    const predicate = Nodes.isFid(uuid)
      ? (f: NodeLike) => f.fid === key
      : (f: NodeLike) => f.uuid === key;
    const builtinFolder = builtinFolders.find(predicate);

    if (builtinFolder) {
      return right(builtinFolder);
    }

    const nodeOrErr = await this.#getFromRepository(uuid);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isFolder(nodeOrErr.value)) {
      return left(new FolderNotFoundError(uuid));
    }

    return right(nodeOrErr.value);
  }

  async #getBuiltinNodeOrFromRepository(
    uuid: string,
  ): Promise<Either<NodeNotFoundError, NodeLike>> {
    const key = Nodes.isFid(uuid) ? Nodes.uuidToFid(uuid) : uuid;
    const predicate = Nodes.isFid(uuid)
      ? (f: NodeLike) => f.fid === key
      : (f: NodeLike) => f.uuid === key;
    const builtinNode = builtinFolders.find(predicate);

    if (builtinNode) {
      return right(builtinNode);
    }

    return this.#getFromRepository(uuid);
  }

  async #getFromRepository(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    if (Nodes.isFid(uuid)) {
      return await this.context.repository.getByFid(Nodes.uuidToFid(uuid));
    }

    return this.context.repository.getById(uuid);
  }

  async #getNodeAspects(
    ctx: AuthenticationContext,
    node: FileNode | FolderNode | MetaNode,
  ): Promise<AspectNode[]> {
    if (!node.aspects || node.aspects.length === 0) {
      return [];
    }

    const nodesOrErrs = await Promise.all(node.aspects.map((a) => this.get(ctx, a)));

    return nodesOrErrs
      .filter((nodeOrErr) => nodeOrErr.isRight())
      .map((nodeOrErr) => nodeOrErr.value as AspectNode);
  }

  async #processAtFilters(f: NodeFilters): Promise<Either<false, NodeFilters>> {
    const [at, filters] = f.reduce(
      (acc, cur) => {
        if (cur[0].startsWith("@")) {
          acc[0].push([cur[0].substring(1), cur[1], cur[2]]);
          return acc;
        }

        acc[1].push(cur);
        return acc;
      },
      [[], []] as [NodeFilters, NodeFilters],
    );

    at.push(["mimetype", "==", Nodes.FOLDER_MIMETYPE]);

    const result = await this.context.repository.filter(at, Number.MAX_SAFE_INTEGER, 1);

    if (result.nodes.length === 0) {
      return left(false);
    }

    filters.push(["parent", "in", result.nodes.map((n) => n.uuid)]);

    return right(filters);
  }

  #aspectToProperties(aspect: AspectNode): AspectProperty[] {
    return aspect.properties.map((p) => {
      return { ...p, name: `${aspect.uuid}:${p.name}` };
    });
  }

  #listSystemRootFolder(): FolderNode[] {
    return SYSTEM_FOLDERS;
  }

  #mapAntboxMimetypes(mimetype: string): string {
    const mimetypeMap = {
      [Nodes.ACTION_MIMETYPE]: "application/javascript",
      [Nodes.ASPECT_MIMETYPE]: "application/json",
      [Nodes.EXT_MIMETYPE]: "application/javascript",
      [Nodes.SMART_FOLDER_MIMETYPE]: "application/json",
    };

    return mimetypeMap[mimetype] ?? mimetype;
  }
}
