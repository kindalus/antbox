import { AntboxError } from "../../shared/antbox_error.ts";
import { Either } from "../../shared/either.ts";
import { Aspect } from "../aspects/aspect.ts";
import { AuthContextProvider } from "../auth/auth_provider.ts";
import { AggregationFormulaError } from "../nodes/aggregation_formula_error.ts";
import { FolderNode } from "../nodes/folder_node.ts";
import { FolderNotFoundError } from "../nodes/folder_not_found_error.ts";
import { Node } from "../nodes/node.ts";
import { NodeFilter } from "../nodes/node_filter.ts";
import { NodeNotFoundError } from "../nodes/node_not_found_error.ts";
import { NodeFilterResult } from "../nodes/node_repository.ts";
import { SmartFolderNodeEvaluation } from "../nodes/smart_folder_evaluation.ts";
import { SmartFolderNodeNotFoundError } from "../nodes/smart_folder_node_not_found_error.ts";

export interface RunContext {
  readonly nodeService: INodeService;
  readonly authContext: AuthContextProvider;
}

export interface INodeService {
  createFile(
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>>;

  createFolder(
    metadata: Partial<FolderNode>
  ): Promise<Either<AntboxError, FolderNode>>;

  createMetanode(metadata: Partial<Node>): Promise<Either<AntboxError, Node>>;

  duplicate(uuid: string): Promise<Either<NodeNotFoundError, Node>>;

  copy(uuid: string, parent: string): Promise<Either<NodeNotFoundError, Node>>;

  updateFile(
    uuid: string,
    file: File
  ): Promise<Either<NodeNotFoundError, void>>;

  delete(uuid: string): Promise<Either<NodeNotFoundError, void>>;

  get(uuid: string): Promise<Either<NodeNotFoundError, Node>>;

  getAspect(uuid: string): Promise<Either<NodeNotFoundError, Aspect>>;

  list(parent?: string): Promise<Either<FolderNotFoundError, Node[]>>;

  listAspects(): Promise<Aspect[]>;

  query(
    filters: NodeFilter[],
    pageSize: number,
    pageToken?: number
  ): Promise<Either<AntboxError, NodeFilterResult>>;

  update(
    uuid: string,
    data: Partial<Node>,
    merge?: boolean
  ): Promise<Either<NodeNotFoundError, void>>;

  evaluate(
    uuid: string
  ): Promise<
    Either<
      SmartFolderNodeNotFoundError | AggregationFormulaError,
      SmartFolderNodeEvaluation
    >
  >;

  export(uuid: string): Promise<Either<NodeNotFoundError, File>>;
}
