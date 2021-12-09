import { NodeFilterResult } from "./node_service.ts";
import { Node, NodeFilter } from "./node.ts";

export interface NodeRepository {
	delete(uuid: string): Promise<void>;
	update(node: Node): Promise<void>;
	add(node: Node): Promise<void>;
	getByFid(fid: string): Promise<Node>;
	getById(uuid: string): Promise<Node>;
	filter(
		constraints: NodeFilter[],
		pageSize: number,
		pageToken: number,
	): Promise<NodeFilterResult>;
}
