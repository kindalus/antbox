import { Node, NodeFilter } from "./node.ts";

export interface NodeFilterResult {
  pageToken: number;
  pageSize: number;
  pageCount: number;
  nodes: Array<Node>;
}

export interface NodeRepository {
  delete(uuid: string): Promise<void>;
  update(node: Node): Promise<void>;
  add(node: Node): Promise<void>;
  getByFid(fid: string): Promise<Node>;
  getById(uuid: string): Promise<Node>;
  filter(
    constraints: NodeFilter[],
    pageSize: number,
    pageToken: number
  ): Promise<NodeFilterResult>;
}
