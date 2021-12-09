import { RequestContext } from "./request_context.ts";
import { Node, NodeFilter } from "./node.ts";
import { FidGenerator } from "./fid_generator.ts";
import { NodeRepository } from "./node_repository.ts";
import { StorageProvider } from "./storage_provider.ts";
import { UuidGenerator } from "./uuid_generator.ts";

export interface NodeServiceContext {
  readonly fidGenerator?: FidGenerator;
  readonly uuidGenerator?: UuidGenerator;
  readonly storage: StorageProvider;
  readonly repository: NodeRepository;
}

export interface NodeService {
  /**
   * Cria uma cópia do nó na mesma directoria que o nó original.
   * Se o nó for um ficheiro e estiver associado a um workflow, as propriedades do workflow não serão copiadas.
   */
  copy(request: RequestContext, uuid: string): Promise<string>;

  /**
   * Cria uma nova directoria.
   * Devolve o uuid da directoria criada
   */
  createFolder(
    request: RequestContext,
    title: string,
    parent?: string,
  ): Promise<string>;

  /**
   * Cria um nó.
   */
  createFile(
    request: RequestContext,
    file: File,
    parent?: string,
  ): Promise<string>;
  updateFile(
    request: RequestContext,
    uuid: string,
    file: File,
  ): Promise<void>;

  /**
   * Apaga de forma permanente um nó sem passar pela lixeira.
   */
  delete(request: RequestContext, uuid: string): Promise<void>;

  /**
   * Devolve a representação do nó. Por uuid ou fid
   * No caso de a procura ser por fid, utilizar o prefixo fid:
   */
  get(request: RequestContext, uuid: string): Promise<Node>;

  /**
   * Lista ou procura por aspectos.
   * @param parent Lista separada por vírgulas das directorias onde começar a procura
   */
  list(request: RequestContext, parent: string | undefined): Promise<Node[]>;

  /**
   * Lista ou procura por aspectos.
   * @param parent Lista separada por vírgulas das directorias onde começar a procura
   * @param orderBy Lista separada por vírgulas dos campos pelos quais ordenar
   * @param pageSize Número máximo de nós a apresentar por página. Default: 25
   * @param pageToken Número da página a devolver: Default: 1
   */
  query(
    request: RequestContext,
    constraints: NodeFilter[],
    pageSize?: number,
    pageToken?: number,
  ): Promise<NodeFilterResult>;

  /**
   * Actualiza o conteúdo de um ficheiro.
   */
  update(
    request: RequestContext,
    uuid: string,
    node: Partial<Node>,
  ): Promise<void>;

  /**
   * Calcula os valores das agregações.
   */
  evaluate(
    request: RequestContext,
    uuid: string,
  ): Promise<SmartFolderNodeEvaluation>;

  export(request: RequestContext, uuid: string): Promise<Blob>;
}

export interface SmartFolderNodeEvaluation {
  records: Record<string, unknown>[];
  aggregations?: {
    title: string;
    value: unknown;
  }[];
}

export interface NodeFilterResult {
  pageToken: number;
  pageSize: number;
  pageCount: number;
  nodes: Array<Node>;
}
