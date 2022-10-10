import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { NodeFilterResult } from "/domain/nodes/node_repository.ts";
import { Node } from "/domain/nodes/node.ts";
import { Aspect } from "/domain/aspects/aspect.ts";
import { NodeFilter } from "../nodes/node_filter.ts";

/**
 * Representado em ficheiro js com o formato:
 * export const spec = {
 * 	title: string;
 * 	description: string;
 * 	builtIn: boolean;
 * 	multiple: boolean;
 *  auto: boolean;
 * 	aspectConstraints: string[];
 * 	mimetypeConstraints: string[];
 * 	params: ActionParams[];
 * }
 *
 * export function run: (ctx, params, uuids) => Promise<void>;);
 */
export interface Action {
  uuid: string;
  title: string;
  description: string;
  builtIn: boolean;
  multiple: boolean;
  runOnCreates?: boolean;
  runOnUpdates?: boolean;
  runManually?: boolean;
  aspectConstraints?: string[];
  mimetypeConstraints?: string[];
  params?: string[];

  run: (
    ctx: RunContext,
    uuids: string[],
    params?: Record<string, string>
  ) => Promise<void | Error>;
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
    data: Partial<Node>,
    merge?: boolean
  ): Promise<void>;
}

export interface AspectServiceForActions {
  get(principal: UserPrincipal, uuid: string): Promise<Aspect>;
  list(principal: UserPrincipal): Promise<Aspect[]>;
}
