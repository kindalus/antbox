import { NodeFilterResult } from "/domain/nodes/node_repository.ts";
import { Node, NodeFilter } from "/domain/nodes/node.ts";
import { Aspect } from "/domain/aspects/aspect.ts";
import Principal from "../auth/principal.ts";

/**
 * Representado em ficheiro js com o formato:
 *
 * export default {
 * 	uuid: string;
 * 	title: string;
 * 	description: string;
 * 	run: (ctx, params, uuids) => Promise<void>;);
 * 	builtIn: boolean;
 * 	multiple: string;
 * 	aspectConstraints: string[];
 * 	mimetypeConstraints: string[];
 * 	params: ActionParams[];
 * }
 */
export default interface Action {
  uuid: string;
  title: string;
  description: string;
  run: (
    ctx: RunContext,
    params: Record<string, unknown>,
    uuids: string[]
  ) => Promise<void | Error>;
  builtIn: boolean;
  multiple: string;
  aspectConstraints: string[];
  mimetypeConstraints: string[];
  params: ActionParams[];
}
export interface ActionParams {
  name: string;
  title: string;
  type: string;
  required: boolean;
  validationRegex?: string;
  validationList?: string[];
}

export interface RunContext {
  readonly principal: UserPrincipal;
  readonly nodeService: NodeServiceForActions;
  readonly aspectService: AspectServiceForActions;
}

export interface NodeServiceForActions {
  createFile(
    principal: UserPrincipal,
    file: File,
    parent: string
  ): Promise<string>;

  createFolder(
    principal: UserPrincipal,
    title: string,
    parent: string
  ): Promise<string>;

  copy(principal: UserPrincipal, uuid: string): Promise<string>;

  updateFile(principal: UserPrincipal, uuid: string, file: File): Promise<void>;

  delete(principal: UserPrincipal, uuid: string): Promise<void>;

  get(principal: UserPrincipal, uuid: string): Promise<Node>;

  list(principal: UserPrincipal, parent: string): Promise<Node[]>;

  query(
    principal: UserPrincipal,
    constraints: NodeFilter[],
    pageSize: number,
    pageToken: number
  ): Promise<NodeFilterResult>;

  update(
    principal: UserPrincipal,
    uuid: string,
    data: Partial<Node>
  ): Promise<void>;
}

export interface AspectServiceForActions {
  get(principal: UserPrincipal, uuid: string): Promise<Aspect>;
  list(principal: UserPrincipal): Promise<Aspect[]>;
}
