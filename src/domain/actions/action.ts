import { AuthContextProvider } from "../../application/auth_provider.ts";
import { SmartFolderNodeEvaluation } from "../../application/smart_folder_evaluation.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either } from "../../shared/either.ts";
import { Aspect } from "../aspects/aspect.ts";
import { Node } from "../nodes/node.ts";
import { NodeFilter } from "../nodes/node_filter.ts";
import { NodeFilterResult } from "../nodes/node_repository.ts";

/**
 * Regras das actions:
 * - para poder executar runOnCreate ou runOnUpdate
 * --- especificar aspect ou mimetype constraints
 * --- não pode especificar parametros
 *
 * - para ser executar como trigger das folders
 * --- tem que especificar o mimetype 'application/folder'
 * --- a folder tem que conter um dos aspectos especificados na mimetype constraints
 *
 * - para poder executar na interface gráfica, recomenda-se:
 * --- não pode especificar parametros
 * --- deve ter runManually = true
 * --- o nó deve especificar um mimetype e um dos aspectos
 *     especificados na mimetype e aspect constraints
 *
 * - se não for especificado, pode correr manualmente
 */
export interface Action {
  uuid: string;
  title: string;
  description: string;
  builtIn: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  params: string[];

  filters: NodeFilter[];

  run: (
    ctx: RunContext,
    uuids: string[],
    params?: Record<string, string>
  ) => Promise<void | Error>;
}

export interface RunContext {
  readonly nodeService: SecureNodeService;
  readonly aspectService: SecureAspectService;
  readonly authContext: AuthContextProvider;
}

export interface SecureAspectService {
  createOrReplace(
    authCtx: AuthContextProvider,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>>;

  get(
    authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, Aspect>>;

  list(authCtx: AuthContextProvider): Promise<Either<AntboxError, Aspect[]>>;
}

export interface SecureNodeService {
  createFile(
    authCtx: AuthContextProvider,
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>>;

  createMetanode(
    _authCtx: AuthContextProvider,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>>;

  createFolder(
    authCtx: AuthContextProvider,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>>;

  list(
    _authCtx: AuthContextProvider,
    uuid?: string
  ): Promise<Either<AntboxError, Node[]>>;

  get(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, Node>>;

  query(
    _authCtx: AuthContextProvider,
    filters: NodeFilter[],
    pageSize?: number,
    pageToken?: number
  ): Promise<Either<AntboxError, NodeFilterResult>>;

  update(
    authCtx: AuthContextProvider,
    uuid: string,
    metadata: Partial<Node>,
    merge?: boolean
  ): Promise<Either<AntboxError, void>>;

  export(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, File>>;

  copy(
    _authCtx: AuthContextProvider,
    uuid: string,
    parent: string
  ): Promise<Either<AntboxError, Node>>;

  duplicate(
    _authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, Node>>;

  updateFile(
    _authCtx: AuthContextProvider,
    uuid: string,
    file: File
  ): Promise<Either<AntboxError, void>>;

  evaluate(
    authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, SmartFolderNodeEvaluation>>;

  delete(
    authCtx: AuthContextProvider,
    uuid: string
  ): Promise<Either<AntboxError, void>>;
}
