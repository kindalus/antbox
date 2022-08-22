export interface ActionParams {
  name: string;
  title: string;
  required: boolean;
  validationRegex?: string;
  validationList?: string[];
}

export interface Principal {
  getPrincipaName(): string;
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

export interface Aspect {
  uuid: string;
}

export type Properties = Record<string, unknown>;

export interface Node {
  uuid: string;
  fid: string;
  title: string;
  description?: string;
  mimetype: string;
  size: number;
  starred: boolean;
  trashed: boolean;
  aspects?: string[];
  parent?: string;
  createdTime: string;
  modifiedTime: string;
  owner: string;
  properties?: Properties;
}
export interface NodeFilter {}

export interface NodeFilterResult {}

export as namespace Actions;
