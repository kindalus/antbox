import type { ApiKeyNode } from "domain/api_keys/api_key_node.ts";

export interface ApiKeyDTO {
	uuid: string;
	title: string;
	group: string;
	owner: string;
	secret?: string;
	description: string;
	createdTime: string;
}

export function nodeToApiKey(metadata: Partial<ApiKeyNode>): ApiKeyDTO {
	return {
		uuid: metadata.uuid,
		title: metadata.title,
		group: metadata.group,
		owner: metadata.owner,
		description: metadata.description,
		createdTime: metadata.createdTime,
	} as ApiKeyDTO;
}
