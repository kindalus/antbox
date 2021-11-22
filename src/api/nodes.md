
copy(uuid: string): Promise<string>;
GET /nodes/:uuid/copy

createFolder(title: string, parent: string): Promise<string>;
POST /nodes/

createFile(file: File, parent?: string): Promise<string>;
POST /upload/nodes
	
updateFile(uuid: string, file: File): Promise<void>;
POST /upload/nodes/:uuid

delete(uuid: string): Promise<void>;
DELETE /nodes/:uuid

get(uuid: string): Promise<Node>;
GET /nodes/:uuid

getNodeUrl(uuid: string): Promise<string>;
NONE
	
list(parent: string | undefined): Promise<Node[]>;
GET /nodes?parent=uuid

query(
		constraints: NodeFilter[],
		pageSize?: number,
		pageToken?: number,
	): Promise<NodeFilterResult>;
POST /nodes/query

update(uuid: string, node: Partial<Node>): Promise<void>;
PATCH /nodes/:uuid

evaluate(uuid: string): Promise<SmartFolderNodeEvaluation>;
GET /nodes/:uuid/evaluate

export(uuid: string): Promise<Blob>;
GET	/nodes/:uuid/export